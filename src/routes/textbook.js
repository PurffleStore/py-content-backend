import express from 'express';
import crypto from 'crypto';
import { generateTextbookContent } from '../agents/textbookOrchestrator.js';

const router = express.Router();

// In-memory job store for textbook generation
const textbookJobs = new Map();

// SSE clients per job
const sseClients = new Map();

function sendSSE(jobId, data) {
  const clients = sseClients.get(jobId) || [];
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch {}
  });
}

/**
 * POST /api/textbook/generate
 * Starts textbook content generation from existing lesson data.
 * Returns jobId immediately; client connects to SSE for progressive updates.
 */
router.post('/generate', async (req, res) => {
  try {
    const { lessonData } = req.body;

    if (!lessonData || !lessonData.title) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'lessonData with a title is required',
      });
    }

    const jobId = crypto.randomUUID();

    // Initialize job
    textbookJobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      stage: 'starting',
      message: 'Starting textbook generation...',
      lessonTitle: lessonData.title,
      outline: null,
      sections: [],
      summary: null,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
    });

    console.log(`📖 Textbook job ${jobId} started for: "${lessonData.title}"`);

    // Return jobId immediately
    res.json({ success: true, jobId });

    // Run pipeline in background
    generateTextbookContent({
      lessonData,
      onProgress: (stage, percent, message) => {
        const job = textbookJobs.get(jobId);
        if (job) {
          job.status = stage === 'complete' ? 'complete' : stage === 'error' ? 'failed' : 'processing';
          job.progress = percent;
          job.stage = stage;
          job.message = message;
        }
        sendSSE(jobId, { type: 'progress', stage, progress: percent, message });
      },
      onSectionComplete: (payload) => {
        const job = textbookJobs.get(jobId);
        if (job) {
          if (payload.type === 'outline') {
            job.outline = payload.data;
          } else if (payload.type === 'section') {
            job.sections.push(payload.data);
          } else if (payload.type === 'summary') {
            job.summary = payload.data;
          }
        }
        // Stream the section/outline/summary to client
        sendSSE(jobId, payload);
      },
    }).then(result => {
      const job = textbookJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.result = result;
        job.progress = 100;
        job.stage = 'complete';
        job.message = `Textbook ready: ${result.sections?.length || 0} sections`;
        job.completedAt = new Date().toISOString();
      }
      sendSSE(jobId, {
        type: 'complete',
        stage: 'complete',
        progress: 100,
        message: `Textbook ready: ${result.sections?.length || 0} sections`,
      });

      // Close SSE connections
      const clients = sseClients.get(jobId) || [];
      clients.forEach(res => { try { res.end(); } catch {} });
      sseClients.delete(jobId);
    }).catch(error => {
      console.error(`Textbook job ${jobId} failed:`, error);
      const job = textbookJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.stage = 'error';
        job.message = error.message;
      }
      sendSSE(jobId, { type: 'error', stage: 'error', progress: 0, message: error.message });

      const clients = sseClients.get(jobId) || [];
      clients.forEach(res => { try { res.end(); } catch {} });
      sseClients.delete(jobId);
    });
  } catch (error) {
    console.error('Error starting textbook generation:', error);
    res.status(500).json({ error: 'Failed to start textbook generation', message: error.message });
  }
});

/**
 * GET /api/textbook/progress/:jobId
 * SSE stream for real-time progress and progressive section delivery.
 */
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = textbookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Textbook job not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    type: 'progress',
    stage: job.stage,
    progress: job.progress,
    message: job.message,
  })}\n\n`);

  // If we already have outline/sections, replay them
  if (job.outline) {
    res.write(`data: ${JSON.stringify({ type: 'outline', data: job.outline })}\n\n`);
  }
  if (job.sections.length > 0) {
    job.sections.forEach((section, index) => {
      res.write(`data: ${JSON.stringify({
        type: 'section',
        index,
        total: job.outline?.tableOfContents?.length || job.sections.length,
        data: section,
      })}\n\n`);
    });
  }
  if (job.summary) {
    res.write(`data: ${JSON.stringify({ type: 'summary', data: job.summary })}\n\n`);
  }

  // If already complete, send final event and close
  if (job.status === 'complete' || job.status === 'failed') {
    res.write(`data: ${JSON.stringify({
      type: job.status === 'complete' ? 'complete' : 'error',
      stage: job.stage,
      progress: job.progress,
      message: job.message,
    })}\n\n`);
    res.end();
    return;
  }

  // Register this client for live updates
  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, []);
  }
  sseClients.get(jobId).push(res);

  // Clean up on disconnect
  req.on('close', () => {
    const clients = sseClients.get(jobId) || [];
    const idx = clients.indexOf(res);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

/**
 * GET /api/textbook/:jobId
 * Retrieve the full textbook result once generation is complete.
 */
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = textbookJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Textbook job not found' });
  }

  res.json({
    success: job.status === 'complete',
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    result: job.result,
    outline: job.outline,
    sections: job.sections,
    summary: job.summary,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

export default router;
