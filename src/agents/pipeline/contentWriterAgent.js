import { callClaude } from '../../utils/agentHelpers.js';

/* ── Grade-level content size rules ──────────────────────────────────────── */
function getContentSpec(grade, topicHint, poemCount = 2, vocabCount = null) {
  const g = String(grade).toLowerCase();
  const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(topicHint);
  // Use exact count from user — no forced minimum of 2
  const poems = Math.min(Math.max(1, parseInt(poemCount) || 2), 6);

  let spec;
  if (['prek','pre-k','k'].includes(g) || g === '1' || g === '2') {
    spec = { tier:'beginner',     warmUpWords:40,  vocabularyCount:6,  explanationWords:80,  isPoetry, poemLines:'4–6 lines',   poemCount:poems };
  } else if (g === '3' || g === '4') {
    spec = { tier:'elementary',   warmUpWords:60,  vocabularyCount:6,  explanationWords:120, isPoetry, poemLines:'6–8 lines',   poemCount:poems };
  } else if (g === '5' || g === '6') {
    spec = { tier:'intermediate', warmUpWords:80,  vocabularyCount:8,  explanationWords:200, isPoetry, poemLines:'8–12 lines',  poemCount:poems };
  } else {
    spec = { tier:'upper',        warmUpWords:100, vocabularyCount:10, explanationWords:350, isPoetry, poemLines:'10–16 lines', poemCount:poems };
  }

  if (vocabCount && parseInt(vocabCount) >= 4) {
    spec.vocabularyCount = Math.min(parseInt(vocabCount), 12);
  }
  return spec;
}

function buildSystemPrompt(spec) {
  const poetryExampleNote = `workedExamples: MUST contain exactly ${spec.poemCount} complete short poems.
  Each poem must:
  - Be ${spec.poemLines} long with REAL rhyming lines (not descriptions)
  - Have a clear, child-friendly title matching the poem's subject
  - Use simple vocabulary appropriate for the grade
  - Have a consistent rhyme scheme (AABB, ABAB, or AAAA)
  - Be about the SPECIFIC topic or character from the teacher's request
  Format EACH as a plain string:
  "POEM 1 — [Title]:\\n[line1]\\n[line2]\\n[line3]\\n[line4]"
  Each poem string must be self-contained. NO nested objects.

poemSummaries: MUST contain exactly ${spec.poemCount} short summaries, one per poem.
  Each summary must:
  - Be 2–4 simple sentences written for young learners
  - Describe WHAT HAPPENS in the poem — the story, the character, the action, the setting, the feeling
  - Be written as if telling a young child what the poem is about
  ⛔ STRICTLY FORBIDDEN — do NOT mention any of these in poemSummaries:
    - rhyme scheme (AABB, ABAB, etc.)
    - line count ("4-line poem", "6-line poem")
    - stanza, meter, structure, verse, syllable
    - "the poem opens with the line..."
    - "the rhyming words are..."
    - any technical poetry label at all
  ✅ CORRECT example: "A little cat plays all day in the sunny garden. It chases butterflies and rolls in the soft grass. The poem captures how happy and free the cat feels on a warm day."
  ❌ WRONG example: "This is a 4-line poem with an AABB rhyme scheme. The poem opens with the line: Fluffy cat loves to play."
  Format as an array of strings: ["Summary for poem 1...", "Summary for poem 2..."]`;

  const normalExampleNote = `workedExamples: 3 concrete, step-by-step examples matching the grade level.
  Each example should: show a clear problem and solution. Max 3 sentences each.
  For interactive examples, use format: { "label": "Example N", "question": "...", "answer": "..." }`;

  return `You are an expert educational content writer. Your content MUST match the grade level exactly.

Return ONLY valid JSON (no markdown) in this format:
{
  "warmUp": "...",
  "mainExplanation": "...",
  "workedExamples": ["...", "..."],
  "poemSummaries": ["2-4 sentence story summary of poem 1...", "2-4 sentence story summary of poem 2..."],
  "teacherNarration": "...",
  "keyVocabulary": [{ "word": "...", "definition": "..." }]
}

NOTE: poemSummaries is ONLY required for poetry lessons. For non-poetry lessons, omit it or set to [].

STRICT RULES for grade tier: ${spec.tier}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• warmUp        → max ${spec.warmUpWords} words. Fun and quick (3 min). ${spec.tier === 'beginner' ? 'Use clapping, call-and-response, or rhyming games.' : 'Activate prior knowledge.'}
• keyVocabulary → EXACTLY ${spec.vocabularyCount} words with simple child-friendly definitions. No more.
• mainExplanation → max ${spec.explanationWords} words. ${spec.isPoetry ? 'Explain what the poem theme means to children in very simple terms.' : 'Explain the concept clearly.'} DO NOT write long essays.
• ${spec.isPoetry ? poetryExampleNote : normalExampleNote}
${spec.isPoetry ? `• poemSummaries → EXACTLY ${spec.poemCount} summaries (one per poem). Each: 2–4 sentences max. Describe WHAT HAPPENS in that specific poem using the characters, actions, setting, and mood. Write for a young child. ZERO technical poetry terms allowed.` : ''}
• teacherNarration → ${spec.tier === 'beginner' ? '2-3 sentences only. Tell teacher to use clapping and repetition.' : spec.tier === 'elementary' ? '3-4 sentences with simple teaching tips.' : 'Short teacher guide with discussion prompts.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${spec.isPoetry ? '🎵 POETRY LESSON — The poems in workedExamples ARE the main lesson content. Keep mainExplanation very brief. Each poem must match the SPECIFIC topic from the teacher request — same character, setting, and mood.' : ''}
${spec.tier === 'beginner' || spec.tier === 'elementary' ? '⚠️ SHORT CONTENT ONLY. Do NOT write paragraphs of theory. Children learn through doing, not reading.' : ''}`;
}

export async function runContentWriterAgent(lessonPlan, grade, subject, prompt = '', poemCount = 2, vocabCount = null) {
  const topicHint = `${lessonPlan.title} ${(lessonPlan.keyTopics || []).join(' ')}`;
  const spec = getContentSpec(grade, topicHint, poemCount, vocabCount);

  const customInstruction = prompt
    ? `\nTEACHER REQUEST: "${prompt}" — Every poem MUST be about this exact topic. Use the same characters, setting, and mood described in the request. Do not change the subject.`
    : '';

  const userPrompt = `Write lesson content for:
• Title: ${lessonPlan.title}
• Grade: Grade ${grade} (${spec.tier})
• Subject: ${subject}
• Objectives: ${lessonPlan.objectives.join('; ')}
• Duration: ${lessonPlan.duration}
• Key Topics: ${(lessonPlan.keyTopics || []).join(', ')}${customInstruction}

ENFORCE these size limits exactly:
  warmUp          → max ${spec.warmUpWords} words
  keyVocabulary   → exactly ${spec.vocabularyCount} words
  mainExplanation → max ${spec.explanationWords} words
  workedExamples  → ${spec.isPoetry ? `EXACTLY ${spec.poemCount} short poems (${spec.poemLines} each) — all about the topic above` : '2-3 short examples'}
${spec.isPoetry ? `  poemSummaries   → EXACTLY ${spec.poemCount} summaries, 2–4 sentences each.
    Each summary: describe what happens in that poem (character, action, feeling, setting).
    ⛔ DO NOT mention: rhyme scheme, line count, stanza, structure, "opens with the line", "rhyming words are"` : ''}

Return ONLY the JSON object.`;

  const result = await callClaude(buildSystemPrompt(spec), userPrompt, 3000);

  if (typeof result === 'string') {
    return {
      warmUp: "Let's start with a fun warm-up activity!",
      mainExplanation: result,
      workedExamples: ['See the main content above.'],
      teacherNarration: 'Guide students through the content with enthusiasm.',
      keyVocabulary: [],
    };
  }

  // Hard-enforce vocabulary limit
  if (Array.isArray(result.keyVocabulary)) {
    result.keyVocabulary = result.keyVocabulary.slice(0, spec.vocabularyCount);
  }

  // Hard-enforce poem count
  if (spec.isPoetry && Array.isArray(result.workedExamples)) {
    result.workedExamples = result.workedExamples.slice(0, spec.poemCount);
  }

  // Hard-enforce poemSummaries count
  if (spec.isPoetry && Array.isArray(result.poemSummaries)) {
    result.poemSummaries = result.poemSummaries.slice(0, spec.poemCount);
  }

  return result;
}
