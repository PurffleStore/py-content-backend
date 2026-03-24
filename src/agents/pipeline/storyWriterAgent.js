import { callClaude } from '../../utils/agentHelpers.js';

/**
 * Grade-level spec for stories.
 */
function getStorySpec(grade) {
  const g = String(grade).toLowerCase();
  if (['prek','pre-k','k','1','2'].includes(g)) {
    return { tier: 'beginner',     paragraphs: 3, wordsPerPara: 40,  vocabCount: 5 };
  } else if (g === '3' || g === '4') {
    return { tier: 'elementary',   paragraphs: 4, wordsPerPara: 60,  vocabCount: 6 };
  } else if (g === '5' || g === '6') {
    return { tier: 'intermediate', paragraphs: 5, wordsPerPara: 90,  vocabCount: 8 };
  }
  return   { tier: 'upper',        paragraphs: 5, wordsPerPara: 120, vocabCount: 10 };
}

export async function runStoryWriterAgent(lessonPlan, grade, subject, prompt = '', vocabCount = null) {
  const spec = getStorySpec(grade);
  if (vocabCount && parseInt(vocabCount) >= 4) {
    spec.vocabCount = Math.min(parseInt(vocabCount), 12);
  }

  const topicHint = `${lessonPlan.title} ${(lessonPlan.keyTopics || []).join(' ')}`;
  const customNote = prompt
    ? `\nTEACHER NOTE: "${prompt}" — Make the story about this exact topic/character/theme.`
    : '';

  const systemPrompt = `You are a master children's story writer for Grade ${grade} (${spec.tier} level).
Write engaging, educational short stories with clear characters, a simple problem, and a satisfying resolution.

Return ONLY valid JSON (no markdown) in this exact format:
{
  "title": "Story title",
  "storySummary": "2-sentence preview for the card (child-friendly, exciting)",
  "paragraphs": ["paragraph 1 text", "paragraph 2 text", "paragraph 3 text", "paragraph 4 text"],
  "moral": "One clear sentence: the lesson/moral of the story",
  "characters": ["Character 1 name", "Character 2 name"],
  "setting": "Where the story takes place (1 phrase)",
  "storyQuestions": [
    { "question": "Who is the main character?", "answer": "..." },
    { "question": "What problem did they face?", "answer": "..." },
    { "question": "How was the problem solved?", "answer": "..." },
    { "question": "What is the moral of the story?", "answer": "..." },
    { "question": "What happened at the end?", "answer": "..." }
  ],
  "keyVocabulary": [
    { "word": "...", "definition": "Simple child-friendly definition", "usedInStory": "The sentence from the story using this word" }
  ],
  "teacherNotes": "3-4 sentences guiding the teacher on discussion questions, storytelling tips, and comprehension checks"
}

STRICT RULES:
• Each paragraph: exactly ${spec.wordsPerPara}–${spec.wordsPerPara + 20} words. Simple sentences.
• Exactly ${spec.paragraphs} paragraphs total (Beginning, Middle ×${spec.paragraphs - 2}, End)
• Exactly ${spec.vocabCount} vocabulary words — ALL taken directly from the story paragraphs
• keyVocabulary.usedInStory MUST be the exact sentence from the story containing that word
• Characters must have names. Setting must be vivid but simple.
• Moral: one short sentence, child-appropriate lesson
• storyQuestions: EXACTLY 5 questions with clear short answers
• Story must have a complete arc: introduce → problem → action → resolution
• ${spec.tier === 'beginner' ? 'Use very simple words. Max 2-3 sentences per paragraph.' : ''}`;

  const userPrompt = `Write a children's story for:
• Title/Topic: ${lessonPlan.title}
• Grade: Grade ${grade}
• Subject: ${subject}
• Learning Objectives: ${lessonPlan.objectives.join('; ')}
• Key Topics: ${(lessonPlan.keyTopics || []).join(', ')}${customNote}

Paragraph count: ${spec.paragraphs}
Vocab count: ${spec.vocabCount}
Return ONLY the JSON.`;

  const result = await callClaude(systemPrompt, userPrompt, 2000);

  if (typeof result === 'string') {
    return {
      title: lessonPlan.title,
      storySummary: 'An exciting story for young learners.',
      paragraphs: [result],
      moral: 'Always be kind and brave.',
      characters: [],
      setting: '',
      storyQuestions: [],
      keyVocabulary: [],
      teacherNotes: 'Guide students through the story with discussion questions.',
    };
  }

  // Enforce limits
  if (Array.isArray(result.paragraphs)) {
    result.paragraphs = result.paragraphs.slice(0, spec.paragraphs);
  }
  if (Array.isArray(result.keyVocabulary)) {
    result.keyVocabulary = result.keyVocabulary.slice(0, spec.vocabCount);
  }
  if (Array.isArray(result.storyQuestions)) {
    result.storyQuestions = result.storyQuestions.slice(0, 5);
  }

  return result;
}
