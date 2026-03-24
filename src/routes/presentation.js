import express from 'express';
import multer from 'multer';
import { runPresentationAgent } from '../agents/pipeline/presentationAgent.js';
import { generateImages } from '../utils/openaiImageGen.js';

const router = express.Router();

// In-memory file storage (we just need the buffer for text extraction)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Extract plain text from uploaded file */
async function extractText(file) {
  if (!file) return '';
  const mime = file.mimetype || '';
  const name = (file.originalname || '').toLowerCase();

  try {
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(file.buffer);
      return data.text?.substring(0, 5000) || '';
    }
    if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
      const mammoth = (await import('mammoth')).default;
      const result  = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value?.substring(0, 5000) || '';
    }
    if (mime.startsWith('text/') || name.endsWith('.txt')) {
      return file.buffer.toString('utf-8').substring(0, 5000);
    }
    // Legacy .doc — try mammoth first, then HTML-strip (app generates .doc as HTML blobs)
    if (name.endsWith('.doc')) {
      try {
        const mammoth = (await import('mammoth')).default;
        const result  = await mammoth.extractRawText({ buffer: file.buffer });
        if (result.value?.trim().length > 20) return result.value.substring(0, 6000);
      } catch { /* fall through */ }

      // App-generated .doc files are HTML blobs — strip tags to get clean story text
      const rawStr = file.buffer.toString('utf-8');
      const isHtml = /<html|<!DOCTYPE|<body/i.test(rawStr);
      if (isHtml) {
        const clean = rawStr
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')        // strip all HTML tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#\d+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean.length > 20) {
          console.log(`   📄 .doc HTML-stripped → ${clean.length} chars: "${clean.substring(0, 120)}…"`);
          return clean.substring(0, 6000);
        }
      }
      // Final fallback: raw ASCII
      return rawStr.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').substring(0, 5000);
    }
  } catch (err) {
    console.warn('File extraction warning:', err.message);
  }
  return '';
}

/**
 * POST /api/presentation/generate
 * Body (multipart/form-data):
 *   topic, grade, subject, slideCount, style, extraText
 *   file (optional: PDF / DOCX / DOC / TXT)
 */
router.post('/generate', upload.single('file'), async (req, res) => {
  try {
    const {
      topic       = 'Introduction to Reading',
      grade       = '3',
      subject     = 'English',
      slideCount  = '',
      style       = 'colorful',
      extraText   = '',
    } = req.body;

    if (!topic?.trim()) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    // Extract text from uploaded file (if any)
    const fileText = await extractText(req.file);
    const extraContent = [extraText, fileText].filter(Boolean).join('\n\n');

    const fileName = req.file?.originalname || null;
    console.log(`📊 Generating presentation: "${topic}" · Grade ${grade} · ${slideCount || 'auto'} slides${fileName ? ` · File: ${fileName}` : ''}`);
    if (extraContent) console.log(`   📄 Using document content (${extraContent.length} chars)`);

    // ── Phase 1: Generate slide JSON ──
    const presentation = await runPresentationAgent({
      topic: topic.trim(),
      grade,
      subject,
      slideCount: slideCount ? parseInt(slideCount) : undefined,
      extraContent,
      style,
    });

    // ── Phase 2: Generate images for every slide ──
    const imagePrompts = (presentation.slides || []).map((slide, i) => {
      const base = slide.imagePrompt || `${slide.title || topic}, Grade ${grade} educational illustration`;
      return base;
    });

    console.log(`🎨 Generating ${imagePrompts.length} slide images…`);
    const imageUrls = await generateImages(imagePrompts, 2); // 2 at a time to respect rate limits

    // Attach imageUrl to each slide
    presentation.slides.forEach((slide, i) => {
      if (imageUrls[i]) slide.imageUrl = imageUrls[i];
    });

    console.log(`✅ Presentation ready — ${presentation.slides.length} slides, ${imageUrls.filter(Boolean).length} images`);
    res.json({ success: true, presentation });

  } catch (err) {
    console.error('Presentation generation error:', err);
    res.status(500).json({ error: 'Failed to generate presentation', details: err.message });
  }
});

export default router;
