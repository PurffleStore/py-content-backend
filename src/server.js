import config from './config.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import lessonRoutes from './routes/lessons.js';
import batchLessonRoutes from './routes/batchLessons.js';
import textbookRoutes from './routes/textbook.js';
import historyRoutes from './routes/history.js';
import presentationRoutes from './routes/presentation.js';
import { errorHandler } from './utils/errorHandler.js';
import { generateImage } from './utils/openaiImageGen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated images as static files
app.use('/generated-images', express.static(path.join(__dirname, '..', 'public', 'generated-images')));

// Routes (batch must come before generic lessons to avoid path conflicts)
app.use('/api/lessons/batch', batchLessonRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/textbook', textbookRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/presentation', presentationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// ── Image generation diagnostic endpoint ──────────────────────────────────
// Visit http://localhost:3001/api/test-image to quickly verify DALL-E works.
// Check the backend console for detailed error info if it fails.
app.get('/api/test-image', async (req, res) => {
  console.log('🧪 Test-image endpoint called — attempting DALL-E generation…');
  const openaiKey = config.openaiApiKey;
  if (!openaiKey) {
    return res.status(500).json({ success: false, error: 'OPENAI_API_KEY is not set in .env' });
  }
  console.log(`   Key prefix : ${openaiKey.slice(0, 20)}... (${openaiKey.length} chars)`);

  const imagePath = await generateImage('a cheerful cartoon apple sitting on a desk, bright colors, simple illustration for children');
  if (imagePath) {
    const publicUrl = `http://localhost:${config.port}${imagePath}`;
    console.log('✅ Image generated:', publicUrl);
    return res.json({ success: true, imagePath, publicUrl });
  } else {
    return res.status(500).json({
      success: false,
      error: 'Image generation returned null — check backend console for the exact error and fix hint',
    });
  }
});
// ─────────────────────────────────────────────────────────────────────────

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📚 API available at http://localhost:${PORT}/api`);
  console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
});

export default app;
