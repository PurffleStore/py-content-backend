import express from 'express';
import { generateLesson } from '../agents/lessonGenerator.js';

const router = express.Router();

// POST - Generate a lesson
router.post('/generate', async (req, res) => {
  try {
    const { chapter, lesson, grade, subject, level, resources = [], options } = req.body;

    // Validate required fields
    if (!chapter && !lesson) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'chapter and lesson are required',
      });
    }

    console.log(`🎓 Generating lesson - Chapter ${chapter}, Lesson ${lesson}`);
    console.log(`📦 Selected Resources: ${resources.length > 0 ? resources.join(', ') : 'None'}`);
    console.log(`📊 Grade: ${grade}, Subject: ${subject}, Level: ${level}`);

    // Call the lesson generator agent with all parameters
    const result = await generateLesson({
      chapter,
      lesson,
      grade,
      subject,
      level,
      resources,
      options
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating lesson:', error);
    res.status(500).json({
      error: 'Generation failed',
      message: error.message,
    });
  }
});

// GET - Health check for lessons endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Lessons service is running',
  });
});

export default router;
