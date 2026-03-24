import { callClaude } from '../../utils/agentHelpers.js';

/* ── Grade-level exercise rules ───────────────────────────────────────────── */
function getPracticeSpec(grade, topicHint) {
  const g = String(grade).toLowerCase();
  const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(topicHint);

  if (['prek','pre-k','k'].includes(g) || g === '1' || g === '2') {
    return {
      tier: 'beginner',
      easy: 3, medium: 2, challenge: 1,
      types: 'fill-in-blank, matching',
      note: isPoetry
        ? 'Easy: identify a word from the poem that describes the character or action. Medium: complete a line from the poem. Challenge: write 1 sentence about what happens in the poem.'
        : 'Very simple recall questions. Single-word or one-line answers only.',
    };
  }
  if (g === '3' || g === '4') {
    return {
      tier: 'elementary',
      easy: 3, medium: 3, challenge: 2,
      types: 'fill-in-blank, multiple-choice, short-answer',
      note: isPoetry
        ? 'Easy: identify a word from the poem. Medium: answer a question about the poem meaning or character. Challenge: write 2 sentences about what the poem is about.'
        : 'Simple questions with short answers. No essays.',
    };
  }
  if (g === '5' || g === '6') {
    return {
      tier: 'intermediate',
      easy: 3, medium: 3, challenge: 2,
      types: 'fill-in-blank, multiple-choice, short-answer',
      note: 'Mix of recall, comprehension, and application questions about the poem.',
    };
  }
  return {
    tier: 'upper',
    easy: 3, medium: 3, challenge: 3,
    types: 'fill-in-blank, multiple-choice, short-answer, analysis',
    note: 'Include analysis and extended response questions about the poem.',
  };
}

const SYSTEM_PROMPT = `You are an expert at creating grade-appropriate practice exercises. Return ONLY valid JSON (no markdown):

{
  "exercises": {
    "easy":      [{ "question": "...", "type": "fill-in-blank|multiple-choice|matching|short-answer", "hint": "..." }],
    "medium":    [{ "question": "...", "type": "fill-in-blank|multiple-choice|matching|short-answer", "hint": "..." }],
    "challenge": [{ "question": "...", "type": "fill-in-blank|multiple-choice|matching|short-answer", "hint": "..." }]
  }
}

CRITICAL: Match difficulty and question length to the grade level exactly. For poetry, all questions must reference the actual poem content — characters, actions, words, and meaning. Never ask about generic poetry theory.`;

/**
 * @param {Object} lessonPlan
 * @param {Object} content
 * @param {string} grade
 * @param {Array<{title:string, lines:string[], body:string}>} poemTexts
 */
export async function runPracticeAgent(lessonPlan, content, grade, poemTexts = []) {
  const topicHint = `${lessonPlan.title} ${(lessonPlan.keyTopics || []).join(' ')}`;
  const spec = getPracticeSpec(grade, topicHint);
  const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(topicHint);

  // Build poem context for poem-specific exercises
  let poemContext = '';
  if (isPoetry && poemTexts.length > 0) {
    poemContext = `\nACTUAL POEM CONTENT (all exercises must be based on these poems):\n` +
      poemTexts.map((pt, i) =>
        `Poem ${i + 1} — "${pt.title}":\n${pt.body}`
      ).join('\n\n') + '\n';
  }

  const userPrompt = `Create practice exercises for Grade ${grade} (${spec.tier}) lesson:
- Title: ${lessonPlan.title}
- Objectives: ${lessonPlan.objectives.join('; ')}
- Key vocabulary: ${(content.keyVocabulary || []).map(v => v.word).join(', ')}${poemContext}

RULES:
• easy      → exactly ${spec.easy} questions. Types: ${spec.types}
• medium    → exactly ${spec.medium} questions. Types: ${spec.types}
• challenge → exactly ${spec.challenge} questions. Types: ${spec.types}
• ${spec.note}
${isPoetry && poemTexts.length > 0
  ? `• EVERY question must refer to the actual poem text above — use real character names, words, lines, and events from the poems
• Do NOT ask about generic poetry concepts — all questions must be about THIS specific poem content`
  : ''}
• Keep all questions SHORT and appropriate for Grade ${grade} students.
• Total questions: ${spec.easy + spec.medium + spec.challenge}

Return ONLY the JSON object.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 2000);

  if (typeof result === 'string') {
    return {
      exercises: {
        easy:      [{ question: 'Practice question 1', type: 'short-answer', hint: '' }],
        medium:    [{ question: 'Practice question 2', type: 'short-answer', hint: '' }],
        challenge: [{ question: 'Practice question 3', type: 'short-answer', hint: '' }],
      },
    };
  }

  // Hard-enforce question counts
  if (result.exercises) {
    result.exercises.easy      = (result.exercises.easy      || []).slice(0, spec.easy);
    result.exercises.medium    = (result.exercises.medium    || []).slice(0, spec.medium);
    result.exercises.challenge = (result.exercises.challenge || []).slice(0, spec.challenge);
  }

  return result;
}
