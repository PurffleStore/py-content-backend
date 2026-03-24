import { callClaude } from '../../utils/agentHelpers.js';

/**
 * Grade-level guidance for presentations
 */
function getGradeSpec(grade) {
  const g = parseInt(grade) || 3;
  if (g <= 2)  return { slides: 6,  bulletLen: 'very short (3-4 words each)', language: 'very simple words, big font style', emoji: 'lots of fun emojis' };
  if (g <= 4)  return { slides: 8,  bulletLen: 'short (5-7 words each)',       language: 'simple clear sentences',           emoji: 'relevant emojis on each slide' };
  if (g <= 6)  return { slides: 10, bulletLen: 'medium (8-12 words each)',      language: 'clear educational language',       emoji: 'emojis where helpful' };
  return       { slides: 12, bulletLen: 'detailed (up to 15 words)',            language: 'academic but accessible',          emoji: 'emojis sparingly' };
}

export async function runPresentationAgent({ topic, grade = '3', subject = 'English', slideCount, extraContent = '', style = 'colorful' }) {
  const spec = getGradeSpec(grade);
  const numSlides = slideCount || spec.slides;
  const colors = ['blue', 'purple', 'green', 'orange', 'teal', 'red', 'indigo', 'rose'];

  // ── Detect content type ──
  const hasStoryContent = extraContent && extraContent.trim().length > 100;
  const isExperiment = hasStoryContent &&
    /\b(objective|activity|experiment|conclusion|materials|procedure|steps|observe)\b/i.test(extraContent);

  // ── Experiment / structured-document system prompt ──
  const experimentSystemPrompt = `You are an expert educational presentation designer for school children (Grade ${grade}).

You have been given a STRUCTURED DOCUMENT containing experiments or projects (each with Objective, Activity, Conclusion).

ABSOLUTE RULES — break any of these and the output is wrong:
1. Find ALL numbered topics/experiments in the document
2. Create EXACTLY ONE "experiment" slide per topic — NEVER merge multiple topics into one slide
3. Copy the Objective, Activity, and Conclusion TEXT DIRECTLY from the document — do not summarize or shorten
4. Create ONE "multi-quiz" slide with one question per topic (3–5 questions total)
5. First slide = "title", last slide = "summary"
6. DO NOT add generic advice unrelated to the document topics

REQUIRED SLIDE STRUCTURE (in order):
• 1 × "title"      — presentation title from the document
• N × "experiment" — one per topic/experiment found in the document (covers ALL topics, no merging)
• 1 × "multi-quiz" — one question per experiment topic
• 1 × "summary"    — key takeaways from ALL experiments

SLIDE TYPE SCHEMAS:

"title" slide:
{ "type":"title", "title":"...", "subtitle":"...", "emoji":"...", "color":"...", "speakerNotes":"...", "imagePrompt":"..." }

"experiment" slide:
{ "type":"experiment", "title":"Topic Name", "objective":"Full objective from doc", "activity":"Full activity from doc",
  "conclusion":"Full conclusion from doc", "tryThis":"One hands-on tip for students", "emoji":"🧪",
  "color":"...", "speakerNotes":"...", "imagePrompt":"colorful cartoon of this experiment for children" }

"multi-quiz" slide:
{ "type":"multi-quiz", "title":"Science Quiz Time! 🧠", "emoji":"🧠", "color":"orange",
  "questions": [
    { "q": "Question from experiment 1?", "options": ["A","B","C","D"], "answer": "B" },
    { "q": "Question from experiment 2?", "options": ["A","B","C","D"], "answer": "A" }
  ],
  "speakerNotes":"Ask each question one at a time, give 30 seconds each.", "imagePrompt":"..." }

"summary" slide:
{ "type":"summary", "title":"What We Discovered Today", "bullets":["Conclusion from exp 1","Conclusion from exp 2",...],
  "emoji":"⭐", "color":"teal", "speakerNotes":"...", "imagePrompt":"..." }

OTHER RULES:
• Language: ${spec.language}
• Emojis: ${spec.emoji}
• Colors: vary from [${colors.join(', ')}], make it ${style}
• imagePrompt: 20-30 words, child-friendly cartoon illustration of the experiment/topic
• speakerNotes: 1-2 sentences of teacher guidance referencing the experiment

Return ONLY valid JSON (no markdown fences):
{
  "title": "...",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalSlides": <number>,
  "slides": [ ... ]
}`;

  // ── Story-based system prompt ──
  const storySystemPrompt = `You are an expert educational presentation designer for school children (Grade ${grade}).

You have been given a STORY / DOCUMENT as your source material.
CRITICAL RULE: Every single slide MUST be based on that story/document content.
DO NOT produce generic content. DO NOT add tips unrelated to the story. EVERY slide stays inside the story world.

REQUIRED slide structure for a story-based presentation:
1. "title"   → Title slide: the story's actual title + subtitle + emoji
2. "content" → Characters slide: list the main characters (names + brief traits)
3. "content" → Setting slide: describe where/when the story takes place
4. "content" → Story Events: key events that happen in order
5. "visual"  → Key Moment or Image: the most important scene or concept from the story
6. "content" → Lesson/Moral: what the story teaches us
7. "quiz"    → Quiz slide: 4 questions from the story (who, what, where, why)
8. "summary" → What We Learned: key takeaways rooted in the story

If more slides are needed, add more "content" slides exploring deeper parts of the story.
If fewer slides, compress but ALWAYS keep title, characters, events, moral, quiz, summary.

SLIDE TYPES:
- "title"   : Opening slide with big title + subtitle + emoji
- "content" : Slide with title + 3-5 bullet points from the story
- "visual"  : A slide with a big central emoji/concept + 1-2 sentence explanation from the story
- "quiz"    : Interactive question with 4 short options (A/B/C/D) + correct answer — ALL from the story
- "summary" : Closing slide with key takeaways from the story

RULES:
• Exactly ${numSlides} slides total
• First slide must be type "title" with the story's ACTUAL title
• Last slide must be type "summary"
• Include at least 1 "quiz" slide with questions from the story
• Include at least 1 "visual" slide referencing the story
• Bullet points: ${spec.bulletLen}
• Language: ${spec.language}
• Emojis: ${spec.emoji}
• Colors: assign from [${colors.join(', ')}] — vary them, make it ${style}
• speakerNotes: teacher guidance referencing the story (1-2 sentences)
• imagePrompt: a simple, child-friendly illustration description for that slide (20-30 words, describe the scene/character/setting from the story)

Return ONLY valid JSON (no markdown fences):
{
  "title": "Story title",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalSlides": ${numSlides},
  "slides": [
    {
      "type": "title",
      "title": "Story Title Here",
      "subtitle": "A story for Grade ${grade}",
      "emoji": "📚",
      "color": "blue",
      "speakerNotes": "Introduce the story...",
      "imagePrompt": "A cheerful classroom with children listening to a story, colorful and bright"
    },
    {
      "type": "content",
      "title": "Characters",
      "bullets": ["Character name – brief trait", "Character name – brief trait"],
      "emoji": "👤",
      "color": "purple",
      "speakerNotes": "Discuss the characters...",
      "imagePrompt": "A friendly cartoon child character standing in a colorful scene"
    },
    {
      "type": "visual",
      "title": "Key Scene",
      "visual": "🌟",
      "caption": "One sentence describing the most important moment in the story",
      "color": "green",
      "speakerNotes": "Show and explain this key moment...",
      "imagePrompt": "A magical moment from the story, colorful cartoon illustration for children"
    },
    {
      "type": "quiz",
      "title": "Story Quiz!",
      "question": "Who is the main character?",
      "options": ["Short answer A", "Short answer B", "Short answer C", "Short answer D"],
      "answer": "Short answer A",
      "emoji": "🧠",
      "color": "orange",
      "speakerNotes": "Give students 30 seconds to answer...",
      "imagePrompt": "Children raising hands to answer a question in a classroom, cheerful cartoon"
    },
    {
      "type": "summary",
      "title": "What We Learned",
      "bullets": ["Lesson 1 from the story", "Lesson 2 from the story"],
      "emoji": "⭐",
      "color": "teal",
      "speakerNotes": "Review the story lessons with class...",
      "imagePrompt": "Happy children celebrating after a story, colorful classroom scene"
    }
  ]
}`;

  // ── General system prompt (no uploaded document) ──
  const generalSystemPrompt = `You are an expert educational presentation designer for school children (Grade ${grade}).
Create engaging, visually-described slide presentations that teachers can use directly in class.

SLIDE TYPES you must use:
- "title"   : Opening slide with big title + subtitle + emoji
- "content" : Main teaching slide with title + 3-5 bullet points
- "visual"  : A slide with a big central emoji/concept + 1-2 sentence explanation
- "quiz"    : An interactive question slide with 4 short options (A/B/C/D) + correct answer
- "summary" : Closing slide with key takeaways

RULES:
• Exactly ${numSlides} slides total
• First slide must be type "title"
• Last slide must be type "summary"
• Include at least 1 "quiz" slide
• Include at least 1 "visual" slide
• Bullet points: ${spec.bulletLen}
• Language: ${spec.language}
• Emojis: ${spec.emoji}
• Colors: assign from [${colors.join(', ')}] — vary them, make it ${style}
• speakerNotes: teacher guidance for that slide (1-2 sentences)
• imagePrompt: a simple, child-friendly illustration description for that slide (20-30 words, relevant to the slide content)

Return ONLY valid JSON (no markdown fences):
{
  "title": "Presentation title",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalSlides": ${numSlides},
  "slides": [
    {
      "type": "title",
      "title": "Main Title",
      "subtitle": "A subtitle for Grade ${grade}",
      "emoji": "📚",
      "color": "blue",
      "speakerNotes": "Welcome students...",
      "imagePrompt": "A bright colorful classroom with children ready to learn"
    },
    {
      "type": "content",
      "title": "Slide Title",
      "bullets": ["Point one", "Point two", "Point three"],
      "emoji": "🎯",
      "color": "purple",
      "speakerNotes": "Ask students...",
      "imagePrompt": "A colorful educational illustration showing the topic concept"
    },
    {
      "type": "visual",
      "title": "Key Concept",
      "visual": "🌟",
      "caption": "One clear sentence explaining the concept",
      "color": "green",
      "speakerNotes": "Show and explain...",
      "imagePrompt": "A simple bright illustration of the key concept for children"
    },
    {
      "type": "quiz",
      "title": "Quick Quiz!",
      "question": "What is...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "emoji": "🧠",
      "color": "orange",
      "speakerNotes": "Give students 30 seconds...",
      "imagePrompt": "Children enthusiastically answering questions in a cheerful classroom"
    },
    {
      "type": "summary",
      "title": "What We Learned",
      "bullets": ["Key point 1", "Key point 2", "Key point 3"],
      "emoji": "⭐",
      "color": "teal",
      "speakerNotes": "Review with class...",
      "imagePrompt": "Happy students celebrating learning, bright colorful classroom"
    }
  ]
}`;

  const systemPrompt = isExperiment ? experimentSystemPrompt
    : hasStoryContent ? storySystemPrompt
    : generalSystemPrompt;

  const userPrompt = isExperiment
    ? `Create a ${style} Grade ${grade} ${subject} presentation from this structured document.

━━━━━━━━━━━━━━━ FULL DOCUMENT TEXT ━━━━━━━━━━━━━━━
${extraContent.substring(0, 6000)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — Count how many topics/experiments are in the document above.
STEP 2 — Create ONE "experiment" slide for EACH topic. Do not skip any. Do not merge any.
STEP 3 — For each experiment slide, copy the Objective, Activity, and Conclusion WORD-FOR-WORD from the document.
STEP 4 — Create ONE "multi-quiz" slide with one question per experiment topic.
STEP 5 — Add a "title" slide at the start and a "summary" slide at the end.

❌ DO NOT merge topics into one slide.
❌ DO NOT shorten or paraphrase Objective/Activity/Conclusion.
❌ DO NOT add generic science tips not in the document.
Return ONLY JSON.`

    : hasStoryContent
    ? `Create a ${style} school presentation for Grade ${grade} ${subject} students.
Number of slides: ${numSlides}

━━━━━━━━━━━━━━━ FULL STORY / DOCUMENT TEXT ━━━━━━━━━━━━━━━
${extraContent.substring(0, 6000)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEFORE building slides, extract these facts from the story above:
• Story title  → use EXACTLY as the title slide title
• Characters   → list ALL named characters with their traits FROM THE TEXT
• Setting      → where and when the story takes place, from the text
• Key events   → what happens (beginning → middle → end), from the text
• Moral/Lesson → the lesson the story teaches, from the text
• Quiz facts   → 4 questions whose answers appear IN the story text

Then build ${numSlides} slides using ONLY those extracted facts.
❌ DO NOT invent events. ❌ DO NOT add characters not in the text.
Return ONLY JSON.`

    : `Create a ${style} school presentation for:
• Topic: ${topic}
• Subject: ${subject}
• Grade: ${grade}
• Number of slides: ${numSlides}

Make it engaging, educational, and perfect for Grade ${grade} students.
Return ONLY JSON.`;

  const result = await callClaude(systemPrompt, userPrompt, (isExperiment || hasStoryContent) ? 6000 : 4000);

  if (typeof result === 'string') {
    return {
      title: topic,
      subject, grade,
      totalSlides: 3,
      slides: [
        { type: 'title',   title: topic, subtitle: `Grade ${grade} · ${subject}`, emoji: '📚', color: 'blue',   speakerNotes: 'Welcome to class!', imagePrompt: 'A colorful classroom scene with children' },
        { type: 'content', title: 'Key Points', bullets: [result.substring(0, 100)], emoji: '📝', color: 'purple', speakerNotes: 'Discuss with students.', imagePrompt: 'Educational illustration for children' },
        { type: 'summary', title: 'Summary', bullets: ['Great work today!'], emoji: '⭐', color: 'teal', speakerNotes: 'Wrap up.', imagePrompt: 'Happy children celebrating learning' },
      ],
    };
  }

  if (!Array.isArray(result.slides)) result.slides = [];
  result.slides = result.slides.slice(0, 20);
  return result;
}
