import { callClaude } from '../../utils/agentHelpers.js';

const SYSTEM_PROMPT = `You are an expert at creating image generation prompts for educational illustrations. You create vivid, detailed prompts that produce child-friendly, colorful educational images.

You must return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "imagePrompts": [
    {
      "lessonIndex": 0,
      "coverPrompt": "Detailed description for cover image",
      "contentPrompts": [],
      "poemPrompts": ["Illustration for poem 1", "Illustration for poem 2"]
    }
  ]
}

CRITICAL RULES for poemPrompts:
- Each prompt MUST depict EXACTLY what the poem text describes
- Extract: subject/character, action, location, season, objects, mood from the poem lines
- If poem says "cat in garden with butterflies" → show a cat in a garden with butterflies
- If poem says "puppy running in park" → show a puppy running in a park
- If poem says "bunny in winter snow" → show a bunny in snow
- NEVER substitute with unrelated animals, settings, or seasons
- NEVER show owls for cat poems, forests for park poems, summer for winter poems
- Style: bright cheerful watercolor/illustration style suitable for children
- Include the exact subject from the poem lines — match character species, setting, weather, and mood precisely
- Each prompt should be 2-3 descriptive sentences
- Avoid text in images`;

/**
 * @param {Array} lessonPlans
 * @param {string} grade
 * @param {string} subject
 * @param {Array<{title:string, lines:string[], body:string}>} poemTexts - actual poem content
 */
export async function runImagePromptAgent(lessonPlans, grade, subject, poemTexts = []) {
  const lessonSummaries = lessonPlans.map((lp, i) => {
    const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(`${lp.title} ${(lp.keyTopics || []).join(' ')}`);

    let poemDetail = '';
    if (isPoetry && poemTexts.length > 0) {
      poemDetail = poemTexts.map((pt, pi) =>
        `  Poem ${pi + 1} — "${pt.title}":\n  ${pt.body}`
      ).join('\n\n');
    }

    return `${i + 1}. "${lp.title}" - Topics: ${(lp.keyTopics || []).join(', ')}${
      isPoetry && poemTexts.length > 0
        ? `\n[POETRY LESSON — ${poemTexts.length} poem(s)]\nActual poem content:\n${poemDetail}`
        : isPoetry ? ` [POETRY — ${lp.poemCount || 2} poems]` : ''
    }`;
  }).join('\n\n');

  const userPrompt = `Create image generation prompts for these ${lessonPlans.length} Grade ${grade} ${subject} lessons:

${lessonSummaries}

For each lesson:
- ONE cover image prompt capturing the overall lesson theme
- If it is a POETRY lesson with actual poem content provided:
  * Generate ONE poemPrompt per poem
  * Each prompt MUST be derived from that poem's actual text — same character, action, location, season, and mood
  * Do NOT invent unrelated content — stay inside the poem's world
- If no poem text is provided, generate generic poem-style illustration prompts

Return ONLY the JSON object with imagePrompts array.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 3000);

  if (typeof result === 'string') {
    return {
      imagePrompts: lessonPlans.map((lp, i) => {
        const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(`${lp.title} ${(lp.keyTopics || []).join(' ')}`);
        const count = isPoetry ? poemTexts.length || lp.poemCount || 2 : 0;
        return {
          lessonIndex: i,
          coverPrompt: `Cheerful educational illustration about "${lp.title}" for Grade ${grade} students, colorful watercolor style`,
          contentPrompts: [],
          poemPrompts: isPoetry
            ? poemTexts.length > 0
              ? poemTexts.map(pt =>
                  `Bright watercolor illustration of ${pt.title}: ${pt.lines.slice(0, 2).join(', ')}, child-friendly storybook art style, warm cheerful colors`)
              : Array.from({ length: count }, (_, j) =>
                  `Soft watercolor illustration for a children's poem about ${lp.title}, scene ${j + 1}, warm colors, storybook style`)
            : [],
        };
      }),
    };
  }

  return result;
}
