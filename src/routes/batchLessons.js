import express from 'express';
import crypto from 'crypto';
import { generateBatchLessons } from '../agents/orchestrator.js';
import { saveLesson } from '../utils/historyStore.js';

const router = express.Router();

// In-memory job store
const jobs = new Map();

// SSE clients per job
const sseClients = new Map();

function sendSSE(jobId, data) {
  const clients = sseClients.get(jobId) || [];
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch {}
  });
}

// POST - Start batch generation
router.post('/generate', async (req, res) => {
  try {
    const { subject, grade, level, chapter, resources = [], prompt = '',
            lessonCount = 1, poemCount = 3, vocabCount = 6,
            storyDepth = 1, promptCount = 3,
            contentType = 'lesson' } = req.body;
    const count       = Math.min(Math.max(1, parseInt(lessonCount)  || 1), 4);
    const poems       = Math.min(Math.max(1, parseInt(poemCount)    || 2), 6);
    const vocab       = Math.min(Math.max(4, parseInt(vocabCount)   || 6), 12);
    const depth       = Math.min(Math.max(1, parseInt(storyDepth)   || 1), 3);
    const prompts     = Math.min(Math.max(2, parseInt(promptCount)  || 3), 5);

    if (!subject || !grade || !chapter) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'subject, grade, and chapter are required',
      });
    }

    const jobId = crypto.randomUUID();

    // Initialize job
    jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      stage: 'starting',
      message: 'Starting lesson generation...',
      params: { subject, grade, level, chapter, resources, prompt,
                lessonCount: count, poemCount: poems, vocabCount: vocab,
                storyDepth: depth, promptCount: prompts, contentType },
      lessons: null,
      error: null,
      createdAt: new Date().toISOString(),
    });

    const promptLabel = prompt ? ` [custom prompt: "${prompt.substring(0, 60)}..."]` : '';
    console.log(`🚀 Batch job ${jobId} started: ${subject} Grade ${grade} - ${chapter} × ${count} lessons${promptLabel}`);

    // Return jobId immediately
    res.json({ success: true, jobId });

    // Run pipeline count times sequentially in background
    const runAllLessons = async () => {
      const allLessons = [];
      for (let i = 0; i < count; i++) {
        const lessonLabel = count > 1 ? `Lesson ${i + 1}/${count}: ` : '';
        const baseProgress = Math.floor((i / count) * 100);
        const progressScale = 1 / count;

        const lessonResult = await generateBatchLessons({
          subject,
          grade,
          level: level || 'medium',
          chapter,
          resources,
          prompt,
          poemCount: poems,
          vocabCount: vocab,
          storyDepth: depth,
          promptCount: prompts,
          contentType,
          onProgress: (stage, percent, message) => {
            const scaledPercent = Math.floor(baseProgress + percent * progressScale);
            const job = jobs.get(jobId);
            if (job) {
              job.status = stage === 'error' ? 'failed' : 'processing';
              job.progress = scaledPercent;
              job.stage = stage;
              job.message = `${lessonLabel}${message}`;
            }
            sendSSE(jobId, { stage, progress: scaledPercent, message: `${lessonLabel}${message}` });
          },
        });
        allLessons.push(...lessonResult);
      }
      return allLessons;
    };

    runAllLessons().then(allLessons => {
      const lessons = (Array.isArray(allLessons) ? allLessons : []).slice(0, 4);
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.lessons = lessons;
        job.progress = 100;
        job.stage = 'complete';
        job.message = `Generated ${lessons.length} lessons`;
        job.completedAt = new Date().toISOString();
        // Persist to disk for history
        const historyId = saveLesson(jobId, job.params, lessons);
        if (historyId) job.historyId = historyId;
      }
      sendSSE(jobId, { stage: 'complete', progress: 100, message: `Generated ${lessons.length} lessons` });

      // Close SSE connections
      const clients = sseClients.get(jobId) || [];
      clients.forEach(res => { try { res.end(); } catch {} });
      sseClients.delete(jobId);
    }).catch(error => {
      console.error(`Batch job ${jobId} failed:`, error);
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.stage = 'error';
        job.message = error.message;
      }
      sendSSE(jobId, { stage: 'error', progress: 0, message: error.message });

      const clients = sseClients.get(jobId) || [];
      clients.forEach(res => { try { res.end(); } catch {} });
      sseClients.delete(jobId);
    });
  } catch (error) {
    console.error('Error starting batch generation:', error);
    res.status(500).json({ error: 'Failed to start generation', message: error.message });
  }
});

// GET - SSE progress stream
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ stage: job.stage, progress: job.progress, message: job.message })}\n\n`);

  // If already complete, send and close
  if (job.status === 'complete' || job.status === 'failed') {
    res.end();
    return;
  }

  // Register this client
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

// GET - Retrieve job results
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    success: job.status === 'complete',
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    lessons: job.lessons,
    params: job.params,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

export default router;


