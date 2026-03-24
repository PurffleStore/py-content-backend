import { callClaude } from '../../utils/agentHelpers.js';

const SYSTEM_PROMPT = `You are a textbook formatter. You take raw lesson data and format it into a clean, consistent textbook-style structure.

You must return ONLY valid JSON (no markdown, no explanation) matching the fixed textbook pattern. Ensure all fields are present and properly formatted. If a field is missing from the input, generate appropriate placeholder content.

Required output format:
{
  "title": "Lesson Title",
  "grade": "2",
  "subject": "English",
  "level": "medium",
  "duration": "45 minutes",
  "learningObjectives": ["objective 1", "objective 2"],
  "keyVocabulary": [{ "word": "word", "definition": "definition" }],
  "warmUp": "Warm-up activity text",
  "mainExplanation": "Main explanation text",
  "workedExamples": ["Example 1", "Example 2"],
  "practiceExercises": {
    "easy": [{ "question": "q", "type": "type", "hint": "hint" }],
    "medium": [{ "question": "q", "type": "type", "hint": "hint" }],
    "challenge": [{ "question": "q", "type": "type", "hint": "hint" }]
  },
  "quiz": [{ "question": "q", "options": ["A","B","C","D"], "answer": "A", "explanation": "why" }],
  "answerKey": "Full answer key text",
  "teacherNotes": "Teacher notes and tips",
  "additionalResources": "Resource list",
  "description": "2-sentence card description",
  "textbookPages": [
    {
      "pageNumber": 1,
      "section": "Opening Spread",
      "title": "Page title",
      "body": "2-4 paragraphs of textbook content",
      "bullets": ["important point", "important point"],
      "activities": ["activity prompt"],
      "callout": "short highlighted fact or instruction",
      "figureCaption": "caption for illustration"
    }
  ]
}`;

function normalizeParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function chunkItems(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function stringifyExercise(exercise) {
  if (!exercise) return '';
  if (typeof exercise === 'string') return exercise;

  const parts = [];
  if (exercise.question) parts.push(exercise.question);
  if (exercise.type) parts.push(`Type: ${exercise.type}`);
  if (exercise.hint) parts.push(`Hint: ${exercise.hint}`);
  return parts.join(' ');
}

function buildFallbackPages(baseLesson) {
  const explanationParagraphs = normalizeParagraphs(baseLesson.mainExplanation);
  const explanationChunks = chunkItems(explanationParagraphs, 2);
  const examples = (baseLesson.workedExamples || []).map((item) =>
    typeof item === 'string' ? item : JSON.stringify(item)
  );
  const vocabulary = (baseLesson.keyVocabulary || []).map((item) =>
    typeof item === 'string' ? { word: item, definition: '' } : item
  );
  const practiceItems = [
    ...(baseLesson.practiceExercises?.easy || []),
    ...(baseLesson.practiceExercises?.medium || []),
    ...(baseLesson.practiceExercises?.challenge || []),
  ].map(stringifyExercise).filter(Boolean);
  const quizItems = (baseLesson.quiz || []).map((item) =>
    typeof item === 'string'
      ? item
      : `${item.question}${item.options?.length ? ` Options: ${item.options.join(' | ')}` : ''}`
  );

  const pages = [
    {
      pageNumber: 1,
      section: 'Opening Spread',
      title: baseLesson.title,
      body: [
        baseLesson.description,
        `This lesson is designed for Grade ${baseLesson.grade} ${baseLesson.subject} learners and is planned for ${baseLesson.duration}.`,
      ].filter(Boolean).join('\n\n'),
      bullets: baseLesson.learningObjectives || [],
      activities: ['Read the title, study the picture, and predict what you will learn.'],
      callout: 'Start by connecting the lesson to students\' daily life experiences.',
      figureCaption: 'Lesson opener and learning focus',
    },
    {
      pageNumber: 2,
      section: 'Warm-Up and Vocabulary',
      title: 'Get Ready to Learn',
      body: baseLesson.warmUp || 'Begin with a short discussion that activates prior knowledge.',
      bullets: vocabulary.slice(0, 6).map((item) =>
        `${item.word}${item.definition ? `: ${item.definition}` : ''}`
      ),
      activities: ['Use each new vocabulary word in a spoken sentence with a partner.'],
      callout: 'New words become easier when students connect them to familiar situations.',
      figureCaption: 'Warm-up and vocabulary preview',
    },
  ];

  explanationChunks.forEach((chunk, index) => {
    pages.push({
      pageNumber: pages.length + 1,
      section: 'Core Reading',
      title: `Understanding the Topic${explanationChunks.length > 1 ? ` Part ${index + 1}` : ''}`,
      body: chunk.join('\n\n'),
      bullets: index === 0 ? (baseLesson.learningObjectives || []).slice(0, 3) : [],
      activities: index === explanationChunks.length - 1 ? ['Pause and retell the big idea in your own words.'] : [],
      callout: index === 0 ? 'Notice the most important idea in each paragraph.' : '',
      figureCaption: 'Illustrated explanation page',
    });
  });

  pages.push({
    pageNumber: pages.length + 1,
    section: 'Examples and Guided Practice',
    title: 'See It in Action',
    body: examples.join('\n\n') || 'Worked examples will help students apply the concept step by step.',
    bullets: examples.length ? [] : ['Model the thinking process aloud for students.'],
    activities: ['Underline the clue words that explain how the answer was found.'],
    callout: 'Worked examples show both the answer and the thinking behind it.',
    figureCaption: 'Example page',
  });

  pages.push({
    pageNumber: pages.length + 1,
    section: 'Student Practice',
    title: 'Try It Yourself',
    body: 'Students can now complete independent practice to strengthen understanding.',
    bullets: practiceItems.slice(0, 8),
    activities: ['Complete the easy tasks first, then move to medium and challenge work.'],
    callout: 'Encourage neat work, full sentences, and checking answers carefully.',
    figureCaption: 'Practice page',
  });

  pages.push({
    pageNumber: pages.length + 1,
    section: 'Review and Reflect',
    title: 'Quiz, Answers, and Teacher Notes',
    body: [baseLesson.answerKey, baseLesson.teacherNotes, baseLesson.additionalResources]
      .filter(Boolean)
      .join('\n\n'),
    bullets: quizItems.slice(0, 5),
    activities: ['Finish with the quiz and discuss one thing you learned today.'],
    callout: 'Reflection helps students remember the lesson longer.',
    figureCaption: 'Closing review page',
  });

  while (pages.length < 5) {
    pages.push({
      pageNumber: pages.length + 1,
      section: 'Extension',
      title: 'More to Explore',
      body: baseLesson.additionalResources || 'Use this page for extra reading, discussion, or revision.',
      bullets: [],
      activities: ['Choose one idea from today and explain it to a classmate.'],
      callout: '',
      figureCaption: 'Extension page',
    });
  }

  return pages.slice(0, 10);
}

function createBaseLesson(source, rawLesson, grade, subject, level) {
  return {
    title: source.title || rawLesson.title,
    grade: source.grade || grade,
    subject: source.subject || subject,
    level: source.level || level,
    duration: source.duration || rawLesson.duration || '45 minutes',
    learningObjectives: source.learningObjectives || rawLesson.objectives || [],
    keyVocabulary: source.keyVocabulary || rawLesson.content?.keyVocabulary || [],
    warmUp: source.warmUp || rawLesson.content?.warmUp || '',
    mainExplanation: source.mainExplanation || rawLesson.content?.mainExplanation || '',
    workedExamples: source.workedExamples || rawLesson.content?.workedExamples || [],
    practiceExercises: source.practiceExercises || rawLesson.practice?.exercises || { easy: [], medium: [], challenge: [] },
    quiz: source.quiz || rawLesson.assessment?.quiz || [],
    answerKey: source.answerKey || rawLesson.assessment?.answerKey || '',
    teacherNotes: source.teacherNotes || rawLesson.resources?.teacherNotes || '',
    additionalResources: source.additionalResources || rawLesson.resources?.references || '',
    description: source.description || rawLesson.description || '',
    images: rawLesson.images || { cover: null, content: [] },
    resourceSections: source.resourceSections || rawLesson.resources || {},
  };
}

export async function runFormatterAgent(rawLesson, grade, subject, level) {
  const userPrompt = `Format this raw lesson data into the fixed textbook pattern.

Also create a textbookPages array with 5 to 8 reading pages so the lesson can be shown like a real mini-textbook. Each page should feel substantial, child-friendly, and ready for display in a textbook reader.

Title: ${rawLesson.title}
Grade: ${grade}
Subject: ${subject}
Level: ${level}

Raw data:
${JSON.stringify(rawLesson, null, 2).substring(0, 7000)}

Return ONLY the formatted JSON object with ALL required fields.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 5000);

  const baseLesson =
    typeof result === 'string'
      ? createBaseLesson({}, rawLesson, grade, subject, level)
      : createBaseLesson(result, rawLesson, grade, subject, level);

  return {
    ...baseLesson,
    textbookPages:
      Array.isArray(result?.textbookPages) && result.textbookPages.length > 0
        ? result.textbookPages.slice(0, 10)
        : buildFallbackPages(baseLesson),
  };
}
