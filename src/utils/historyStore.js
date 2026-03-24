import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const HISTORY_DIR = path.join(__dirname, '..', '..', 'data', 'history');

// Ensure history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/**
 * Save a completed lesson generation to disk.
 * One JSON file per lesson: {timestamp}-{lessonId}.json
 */
export function saveLesson(jobId, params, lessons) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const lesson    = lessons[0]; // primary lesson
    const id        = `${timestamp}-${jobId}`;

    const record = {
      id,
      jobId,
      title:     lesson?.title     || 'Untitled Lesson',
      grade:     params?.grade     || '',
      subject:   params?.subject   || '',
      level:     params?.level     || '',
      chapter:   params?.chapter   || '',
      prompt:    params?.prompt    || '',
      createdAt: new Date().toISOString(),
      coverImage: lesson?.images?.cover || null,
      lessons,   // full lesson array
    };

    const filePath = path.join(HISTORY_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    console.log(`📁 History saved: ${filePath}`);
    return id;
  } catch (err) {
    console.error('Failed to save lesson history:', err.message);
    return null;
  }
}

/**
 * List all saved lessons (summary only — no full content, for fast listing).
 */
export function listLessons() {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse(); // newest first

    return files.map(file => {
      try {
        const raw    = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf-8');
        const record = JSON.parse(raw);
        // Return summary only (omit full lesson content to keep response small)
        const { lessons, ...summary } = record;
        return { ...summary, lessonCount: lessons?.length || 0 };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('Failed to list history:', err.message);
    return [];
  }
}

/**
 * Get a single lesson record (full content) by id.
 */
export function getLesson(id) {
  try {
    // Try direct filename match
    const filePath = path.join(HISTORY_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    // Fallback: scan for matching id field
    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const raw    = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf-8');
      const record = JSON.parse(raw);
      if (record.id === id) return record;
    }
    return null;
  } catch (err) {
    console.error('Failed to get lesson:', err.message);
    return null;
  }
}

/**
 * Delete a saved lesson by id.
 */
export function deleteLesson(id) {
  try {
    const filePath = path.join(HISTORY_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    // Fallback: find by id field
    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const raw    = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf-8');
      const record = JSON.parse(raw);
      if (record.id === id) {
        fs.unlinkSync(path.join(HISTORY_DIR, file));
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Failed to delete lesson:', err.message);
    return false;
  }
}
