import { callClaude } from '../../utils/agentHelpers.js';

/* ── Grade-level quiz rules ───────────────────────────────────────────────── */
function getAssessmentSpec(grade, topicHint) {
  const g = String(grade).toLowerCase();
  const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(topicHint);

  if (['prek','pre-k','k'].includes(g) || g === '1' || g === '2') {
    return {
      tier: 'beginner',
      quizCount: 5,
      exitTicket: 'Tell me one thing you remember from the poem.',
      note: isPoetry
        ? 'Questions about specific words, characters, and actions IN the poem. Options must be very simple (one or two words). e.g. "What does the cat do in the garden? A) play  B) sleep  C) swim  D) fly"'
        : 'Very simple recall questions with picture-friendly options. One-word answers.',
    };
  }
  if (g === '3' || g === '4') {
    return {
      tier: 'elementary',
      quizCount: 6,
      exitTicket: 'What is your favourite part of the poem and why?',
      note: isPoetry
        ? 'Questions on what the poem is about, what happens in it, how the character feels, and what the poem describes. Simple options, child-friendly language. All questions must reference the actual poem content.'
        : 'Mix of recall and comprehension. Clear, simple language.',
    };
  }
  if (g === '5' || g === '6') {
    return {
      tier: 'intermediate',
      quizCount: 7,
      exitTicket: 'Describe the main event or feeling in the poem and explain why it matters.',
      note: 'Mix of recall, comprehension, and meaning-based questions about the specific poem content.',
    };
  }
  return {
    tier: 'upper',
    quizCount: 8,
    exitTicket: 'Analyse the main message of the poem and give evidence from the text.',
    note: 'Include recall, comprehension, application, and analysis questions about the poem.',
  };
}

const SYSTEM_PROMPT = `You are an expert at creating grade-appropriate assessments. Return ONLY valid JSON (no markdown):

{
  "quiz": [
    {
      "question": "question text",
      "options": ["A) option", "B) option", "C) option", "D) option"],
      "answer": "A",
      "explanation": "Brief explanation"
    }
  ],
  "exitTicket": "A single short reflection question",
  "answerKey": "Formatted answer key"
}

CRITICAL: For poetry lessons, all questions must be about the SPECIFIC poem content provided — the actual characters, actions, words, settings, and meaning of those poems. Do NOT ask about generic poetry concepts, rhyme scheme names, line counts, or technical structure unless it appears in the poem.`;

/**
 * @param {Object} lessonPlan
 * @param {Object} content
 * @param {string} grade
 * @param {Array<{title:string, lines:string[], body:string}>} poemTexts
 */
export async function runAssessmentAgent(lessonPlan, content, grade, poemTexts = []) {
  const topicHint = `${lessonPlan.title} ${(lessonPlan.keyTopics || []).join(' ')}`;
  const spec = getAssessmentSpec(grade, topicHint);
  const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(topicHint);

  // Build poem context for poem-specific quiz
  let poemContext = '';
  if (isPoetry && poemTexts.length > 0) {
    poemContext = `\nACTUAL POEM CONTENT (all quiz questions must be based on these poems):\n` +
      poemTexts.map((pt, i) =>
        `Poem ${i + 1} — "${pt.title}":\n${pt.body}`
      ).join('\n\n') + '\n';
  }

  const userPrompt = `Create assessment for Grade ${grade} (${spec.tier}) lesson:
- Title: ${lessonPlan.title}
- Objectives: ${lessonPlan.objectives.join('; ')}
- Key vocabulary: ${(content.keyVocabulary || []).map(v => v.word).join(', ')}
- Main topics: ${(lessonPlan.keyTopics || []).join(', ')}${poemContext}

RULES:
• quiz        → exactly ${spec.quizCount} multiple-choice questions (A/B/C/D)
• exitTicket  → suggestion: "${spec.exitTicket}" (adapt to match poem content)
• ${spec.note}
${isPoetry && poemTexts.length > 0
  ? `• EVERY question must be about the actual poem content above — characters, what they do, where they are, how they feel, what happens
• Questions must use real words and situations from the poems
• Options must be plausible but with one clearly correct answer based on the poem text
• Do NOT ask generic questions like "what is a rhyme scheme?" — instead ask "What does the cat do in the garden?"`
  : ''}
• Keep questions simple, clear, and appropriate for Grade ${grade}

Return ONLY the JSON object.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 2500);

  if (typeof result === 'string') {
    return {
      quiz: [{ question: 'Review question', options: ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'], answer: 'A', explanation: '' }],
      exitTicket: spec.exitTicket,
      answerKey: 'See quiz answers above.',
    };
  }

  // Hard-enforce quiz count
  if (Array.isArray(result.quiz)) {
    result.quiz = result.quiz.slice(0, spec.quizCount);
  }

  return result;
}
