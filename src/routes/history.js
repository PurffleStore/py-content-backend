import express from 'express';
import { listLessons, getLesson, deleteLesson } from '../utils/historyStore.js';

const router = express.Router();

// GET /api/history — list all saved lessons (summaries)
router.get('/', (req, res) => {
  const lessons = listLessons();
  res.json({ success: true, lessons, total: lessons.length });
});

// GET /api/history/:id — get a single lesson's full data
router.get('/:id', (req, res) => {
  const record = getLesson(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Lesson not found', id: req.params.id });
  }
  res.json({ success: true, record });
});

// DELETE /api/history/:id — remove a saved lesson
router.delete('/:id', (req, res) => {
  const deleted = deleteLesson(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Lesson not found', id: req.params.id });
  }
  res.json({ success: true, message: 'Lesson deleted' });
});

export default router;
