import { callClaude } from '../../utils/agentHelpers.js';

/* ─── Grade tier helper ──────────────────────────────────────────────────── */
export function getGradeTier(grade) {
  const g = String(grade).toLowerCase();
  if (['prek','pre-k','k','1','2'].includes(g)) return 'beginner';
  if (['3','4'].includes(g))                     return 'elementary';
  if (['5','6'].includes(g))                     return 'intermediate';
  return 'upper';
}

function isPoetryLesson(lessonData) {
  const hint = `${lessonData.title} ${(lessonData.keyTopics || []).join(' ')}`;
  return /poem|rhyme|poetry|rhythm|verse/i.test(hint);
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPACT LESSON MODE  (Grade 1–4)
   Single Claude call → 11 fixed lesson sections, strictly size-limited.
   Output shape: { sections: [...], chapterTitle, chapterIntro }
══════════════════════════════════════════════════════════════════════════ */

const COMPACT_SYSTEM = `You are an expert primary school lesson writer. You generate SHORT, structured, classroom-ready lesson content for young children.

STRICT RULES — do NOT break these:
• NO long explanations, NO essays, NO chapter-book narrative
• NO repeated concepts across sections
• Each section must be TIGHT and complete
• Use simple language a child can read aloud
• For poetry lessons: include REAL short poems with actual rhyming lines
• Total lesson content must feel like 1 classroom lesson (30–40 min), not a textbook chapter

Return ONLY valid JSON (no markdown):
{
  "lessonTitle": "...",
  "sections": [
    {
      "id": "learning-objectives",
      "title": "Learning Objectives",
      "content": "• Objective 1\\n• Objective 2\\n• Objective 3",
      "type": "objectives"
    },
    {
      "id": "key-vocabulary",
      "title": "Key Vocabulary",
      "content": "word1 — definition\\nword2 — definition\\n...",
      "type": "vocabulary"
    },
    {
      "id": "warm-up",
      "title": "Warm-Up Activity",
      "content": "Short warm-up description (2–3 lines max)",
      "type": "warmup"
    },
    {
      "id": "main-explanation",
      "title": "Main Explanation",
      "content": "Short explanation (60–80 words max)",
      "type": "explanation"
    },
    {
      "id": "worked-examples",
      "title": "Worked Examples",
      "content": "POEM 1 — [Title]:\\n[line1]\\n[line2]\\n[line3]\\n[line4]\\n\\nPOEM 2 — [Title]:\\n[line1]\\n[line2]\\n[line3]\\n[line4]",
      "type": "poems",
      "imagePrompt": "A child-friendly textbook illustration: ..."
    },
    {
      "id": "practice-exercises",
      "title": "Practice Exercises",
      "content": "Exercise 1 (Easy): ...\\nExercise 2 (Medium): ...\\nExercise 3 (Challenge): ...",
      "type": "practice"
    },
    {
      "id": "quiz",
      "title": "Quiz / Self-Check",
      "content": "1. Question?\\n   A) ...  B) ...  C) ...  D) ...\\n2. Question?\\n   A) ...  B) ...  C) ...  D) ...",
      "type": "quiz"
    },
    {
      "id": "answer-key",
      "title": "Answer Key",
      "content": "1. A  2. B  3. C  (short answers for exercises)",
      "type": "answers"
    },
    {
      "id": "teacher-notes",
      "title": "Teacher Notes & Narration",
      "content": "Tip 1: ...\\nTip 2: ...\\nTip 3: ...",
      "type": "teacher"
    },
    {
      "id": "additional-resources",
      "title": "Additional Resources",
      "content": "• Printable rhyme card\\n• Audio reading\\n• Rhyme matching worksheet",
      "type": "resources"
    },
    {
      "id": "image-blocks",
      "title": "Image Blocks",
      "content": "Image 1: [description]\\nImage 2: [description]",
      "type": "images",
      "imagePrompt": "Primary school textbook illustration: ..."
    }
  ]
}`;

const BEGINNER_SIZE_RULES = `
SECTION SIZE LIMITS — enforce strictly:
┌─────────────────────────────┬────────────────────────────────────────────────────────┐
│ Learning Objectives         │ Exactly 3 bullet points. Each: 5–8 words.              │
│ Key Vocabulary              │ Exactly 5–6 words. Format: word — short meaning        │
│ Warm-Up Activity            │ Max 3 lines. Fun, quick (3 min). Clapping/rhyming game │
│ Main Explanation            │ Max 80 words. 1 short paragraph. Simple sentences.     │
│ Worked Examples             │ 2 short poems. Each poem: 4–6 rhyming lines only.      │
│ Practice Exercises          │ Exactly 3 exercises: Easy / Medium / Challenge         │
│ Quiz / Self-Check           │ Exactly 5 MCQ. Simple wording. 4 options each.         │
│ Answer Key                  │ One-line answers only. No explanation needed.          │
│ Teacher Notes               │ Exactly 3 short teaching tips. 1 line each.           │
│ Additional Resources        │ 3–4 simple items: worksheet, poem card, audio, etc.    │
│ Image Blocks                │ 2 image descriptions. Each: 1 sentence. Child-friendly.│
└─────────────────────────────┴────────────────────────────────────────────────────────┘`;

const ELEMENTARY_SIZE_RULES = `
SECTION SIZE LIMITS — enforce strictly:
┌─────────────────────────────┬────────────────────────────────────────────────────────┐
│ Learning Objectives         │ 4 bullet points. Each: 8–12 words.                     │
│ Key Vocabulary              │ Exactly 6 words with simple definitions.               │
│ Warm-Up Activity            │ Max 4 lines. Quick engaging activity.                  │
│ Main Explanation            │ Max 120 words. 2 short paragraphs.                     │
│ Worked Examples             │ 2 poems (6–8 lines each) OR 3 short examples.          │
│ Practice Exercises          │ Exactly 3 exercises: Easy / Medium / Challenge         │
│ Quiz / Self-Check           │ Exactly 6 MCQ questions.                               │
│ Answer Key                  │ Brief answers only.                                    │
│ Teacher Notes               │ 4 short teaching suggestions.                          │
│ Additional Resources        │ 4–5 simple items.                                      │
│ Image Blocks                │ 2 image descriptions, 1–2 sentences each.              │
└─────────────────────────────┴────────────────────────────────────────────────────────┘`;

/**
 * PRIMARY ENTRY POINT for Grade 1–4.
 * Generates all 11 lesson sections in a single Claude call.
 */
export async function generateCompactLesson(lessonData) {
  const grade   = lessonData.grade   || '2';
  const subject = lessonData.subject || 'English';
  const tier    = getGradeTier(grade);
  const poetry  = isPoetryLesson(lessonData);

  const sizeRules = tier === 'beginner' ? BEGINNER_SIZE_RULES : ELEMENTARY_SIZE_RULES;

  const objectives = (lessonData.learningObjectives || lessonData.objectives || [])
    .map(o => typeof o === 'string' ? o : o.text || '').join('; ');
  const vocab = (lessonData.keyVocabulary || [])
    .map(v => typeof v === 'string' ? v : v.word).join(', ');

  const poetryNote = poetry
    ? `\n🎵 POETRY LESSON — Worked Examples MUST contain 2 real short poems with actual rhyming lines.\n   Example format:\n   "The little cat / Sat on a mat / It saw a rat / And wore a hat"\n   Poems must be original, rhyming, fun, and Grade ${grade}-appropriate.`
    : '';

  const userPrompt = `Generate a complete compact lesson for:
• Title: ${lessonData.title}
• Grade: Grade ${grade} (${tier})
• Subject: ${subject}
• Duration: ${lessonData.duration || '30–35 minutes'}
• Objectives: ${objectives || 'See lesson title'}
• Key Vocabulary: ${vocab || 'Generate 5–6 relevant words'}
• Warm-Up: ${(lessonData.warmUp || '').substring(0, 100) || 'Generate a fun warm-up'}
${poetryNote}
${sizeRules}

CRITICAL RULES:
1. Do NOT write long paragraphs or essays in ANY section
2. Keep each section SHORT — children's attention span is limited
3. ${poetry ? 'The poems must have REAL rhyming lines — not just descriptions of poems' : 'Examples must be concrete and age-appropriate'}
4. Main Explanation: max ${tier === 'beginner' ? '80' : '120'} words — one tight paragraph
5. The entire lesson must feel like 1 classroom session, not a textbook chapter

Return ONLY the JSON object. No markdown, no preamble.`;

  console.log(`  📚 Generating compact lesson (${tier}, grade ${grade})...`);
  const result = await callClaude(COMPACT_SYSTEM, userPrompt, 4000);

  if (typeof result === 'string') {
    return buildFallbackCompactLesson(lessonData, grade, poetry);
  }

  return result;
}

function buildFallbackCompactLesson(lessonData, grade, poetry) {
  const title = lessonData.title || 'Our Lesson';
  return {
    lessonTitle: title,
    sections: [
      { id: 'learning-objectives', title: 'Learning Objectives', type: 'objectives',
        content: '• Understand the main concept\n• Practise with examples\n• Complete the activity' },
      { id: 'key-vocabulary',      title: 'Key Vocabulary',      type: 'vocabulary',
        content: (lessonData.keyVocabulary || []).slice(0, 6).map(v => `${v.word || v} — ${v.definition || ''}`.trim()).join('\n') || 'rhyme — words that sound the same\npoem — a piece of writing with rhythm' },
      { id: 'warm-up',             title: 'Warm-Up Activity',    type: 'warmup',
        content: lessonData.warmUp || 'Clap and say: Cat — Hat! Sun — Fun! Great job!' },
      { id: 'main-explanation',    title: 'Main Explanation',    type: 'explanation',
        content: (lessonData.mainExplanation || '').substring(0, 200) || 'Rhyming words sound the same at the end. Cat and hat rhyme. Sun and fun rhyme. Listen for the matching sound!' },
      { id: 'worked-examples',     title: 'Worked Examples',     type: 'poems',
        content: poetry
          ? 'POEM 1 — The Little Cat:\nThe little cat\nSat on a mat\nIt saw a rat\nAnd wore a hat\n\nPOEM 2 — The Bright Sun:\nThe bright sun\nIs lots of fun\nWe jump and run\nUntil day is done'
          : (lessonData.workedExamples || ['Example 1', 'Example 2']).slice(0, 2).join('\n\n'),
        imagePrompt: poetry ? 'A cheerful cartoon cat wearing a hat, sitting on a colourful mat, primary school textbook style' : null },
      { id: 'practice-exercises',  title: 'Practice Exercises',  type: 'practice',
        content: 'Easy: cat → ____\nMedium: Complete the rhyme: The sun is ___\nChallenge: Write your own rhyming pair' },
      { id: 'quiz',                title: 'Quiz / Self-Check',   type: 'quiz',
        content: '1. Which word rhymes with cat?\n   A) dog  B) hat  C) fish  D) run\n2. Which word rhymes with sun?\n   A) cat  B) mat  C) fun  D) hat\n3. A poem has:\n   A) long words  B) rhyming words  C) numbers  D) big sentences' },
      { id: 'answer-key',          title: 'Answer Key',          type: 'answers',
        content: '1. B  2. C  3. B' },
      { id: 'teacher-notes',       title: 'Teacher Notes & Narration', type: 'teacher',
        content: 'Tip 1: Read poems aloud with clapping rhythm.\nTip 2: Ask students to suggest more rhyming pairs.\nTip 3: Celebrate every attempt — confidence matters!' },
      { id: 'additional-resources', title: 'Additional Resources', type: 'resources',
        content: '• Printable rhyme card\n• Audio poem reading\n• Rhyme matching worksheet' },
      { id: 'image-blocks',        title: 'Image Blocks',         type: 'images',
        content: 'Image 1: A cartoon cat wearing a hat sitting on a mat\nImage 2: Children clapping hands in a circle while reading a poem',
        imagePrompt: 'Children clapping to a rhyme in a colourful classroom, primary school textbook illustration style' },
    ],
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   CHAPTER MODE  (Grade 5+)  — unchanged rich chapter generation
══════════════════════════════════════════════════════════════════════════ */

export async function generateTextbookOutline(lessonData) {
  const grade   = lessonData.grade   || lessonData.formData?.grade   || '3';
  const subject = lessonData.subject || lessonData.formData?.subject || 'English';

  const SYSTEM_PROMPT = `You are an expert textbook author creating chapter outlines for Grade ${grade} educational textbooks.

Return ONLY valid JSON (no markdown):
{
  "chapterTitle": "Chapter title",
  "chapterIntro": "2 short paragraphs introducing the chapter (max 150 words total)",
  "tableOfContents": [
    {
      "id": "section-1",
      "title": "Section title",
      "description": "1 sentence describing this section",
      "estimatedParagraphs": 3,
      "subsections": []
    }
  ]
}

Create 5–6 major sections. Flow: Core Concept → Examples → Practice → Assessment → Extension.`;

  const objectives = lessonData.learningObjectives || lessonData.objectives || [];
  const vocabulary = (lessonData.keyVocabulary || []).map(v => typeof v === 'string' ? v : v.word).join(', ');

  const userPrompt = `Create a textbook chapter outline for:
Title: ${lessonData.title}
Grade: ${grade} | Subject: ${subject} | Level: ${lessonData.level || 'medium'}
Objectives: ${objectives.map(o => typeof o === 'string' ? o : o.text).join('; ')}
Key Vocabulary: ${vocabulary}

Design 5–6 sections that progressively build understanding. Return ONLY the JSON.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 2000);

  if (typeof result === 'string') {
    return {
      chapterTitle: lessonData.title,
      chapterIntro: lessonData.mainExplanation?.substring(0, 300) || 'Welcome to this chapter.',
      tableOfContents: [
        { id: 'section-1', title: 'Introduction',          description: 'Getting started',       estimatedParagraphs: 2, subsections: [] },
        { id: 'section-2', title: 'Core Concepts',         description: 'Main ideas',            estimatedParagraphs: 3, subsections: [] },
        { id: 'section-3', title: 'Worked Examples',       description: 'Examples in action',    estimatedParagraphs: 3, subsections: [] },
        { id: 'section-4', title: 'Practice & Activities', description: 'Hands-on learning',     estimatedParagraphs: 2, subsections: [] },
        { id: 'section-5', title: 'Review & Summary',      description: 'Bringing it together',  estimatedParagraphs: 2, subsections: [] },
      ],
    };
  }
  return result;
}

export async function generateTextbookSection(sectionPlan, outline, lessonData, previousSections = []) {
  const grade   = lessonData.grade   || lessonData.formData?.grade   || '5';
  const subject = lessonData.subject || lessonData.formData?.subject || 'English';
  const tier    = getGradeTier(grade);

  const wordLimit = tier === 'intermediate' ? '250–350' : '350–500';

  const SYSTEM_PROMPT = `You are writing a section of a Grade ${grade} educational textbook. Write in a clear, engaging textbook voice.

Return ONLY valid JSON (no markdown):
{
  "id": "${sectionPlan.id}",
  "title": "${sectionPlan.title}",
  "content": "Educational content, ${wordLimit} words. Use \\n\\n between paragraphs. Clear, age-appropriate language.",
  "keyPoints": ["3–4 key takeaways"],
  "imagePrompt": "Description for an educational illustration (or null)",
  "funFact": "Interesting related fact (or null)",
  "subsections": []
}`;

  const prevContext = previousSections.length > 0
    ? `Previously covered: ${previousSections.map(s => `"${s.title}"`).join(', ')}`
    : '';

  const vocabulary = (lessonData.keyVocabulary || []).map(v => typeof v === 'string' ? v : `${v.word} (${v.definition})`).join(', ');

  const userPrompt = `Write textbook content for:
Chapter: "${outline.chapterTitle}"
Section: "${sectionPlan.title}"
Description: ${sectionPlan.description || ''}
Grade: ${grade} | Subject: ${subject}
Vocabulary: ${vocabulary || 'N/A'}
${prevContext}

Write ${wordLimit} words. Age-appropriate, educational, engaging. Return ONLY the JSON.`;

  console.log(`  📝 Generating section: "${sectionPlan.title}"...`);
  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 3000);

  if (typeof result === 'string') {
    return { id: sectionPlan.id, title: sectionPlan.title, content: result, keyPoints: [], imagePrompt: null, funFact: null, subsections: [] };
  }

  result.id    = sectionPlan.id;
  result.title = sectionPlan.title;
  return result;
}

export async function generateChapterSummary(outline, sections, lessonData) {
  const grade = lessonData.grade || lessonData.formData?.grade || '5';
  const tier  = getGradeTier(grade);

  const SYSTEM_PROMPT = `You are writing a chapter summary for Grade ${grade} students. Keep it encouraging and brief.

Return ONLY valid JSON:
{
  "chapterSummary": "${tier === 'intermediate' ? '1-2 short paragraphs (max 100 words)' : '2 paragraphs (max 150 words)'}",
  "reviewQuestions": ["5–6 review questions appropriate for Grade ${grade}"]
}`;

  const sectionSummaries = sections.map(s =>
    `"${s.title}": ${(s.keyPoints || []).slice(0,2).join('; ') || (s.content || '').substring(0, 100)}`
  ).join('\n');

  const userPrompt = `Write summary for chapter "${outline.chapterTitle}":
${sectionSummaries}

Return ONLY the JSON.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 1500);

  if (typeof result === 'string') {
    return { chapterSummary: result, reviewQuestions: ['What did you learn?', 'Give an example from today.'] };
  }
  return result;
}
