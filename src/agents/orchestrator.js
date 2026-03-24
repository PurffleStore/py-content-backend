import { runPlannerAgent } from './pipeline/plannerAgent.js';
import { runContentWriterAgent } from './pipeline/contentWriterAgent.js';
import { runStoryWriterAgent } from './pipeline/storyWriterAgent.js';
import { runPracticeAgent } from './pipeline/practiceAgent.js';
import { runAssessmentAgent } from './pipeline/assessmentAgent.js';
import { runResourceAgent } from './pipeline/resourceAgent.js';
import { runImagePromptAgent } from './pipeline/imagePromptAgent.js';
import { runQAAgent } from './pipeline/qaAgent.js';
import { runFormatterAgent } from './pipeline/formatterAgent.js';
import { generateImage } from '../utils/openaiImageGen.js';

/**
 * Extract structured poem objects from workedExamples strings.
 * Returns [{title, lines, body}] — used to pass poem content to downstream agents.
 */
function extractPoemTexts(workedExamples = []) {
  const poems = [];
  for (const ex of workedExamples) {
    const raw = typeof ex === 'string' ? ex : (ex?.text || ex?.answer || '');
    const cleaned = raw.replace(/\\n/g, '\n');

    // Format A: "POEM 1 — Title:\nlines..."
    const hdrMatch = cleaned.match(/^POEM\s*\d*\s*[—\-–:]\s*(.+?)\n([\s\S]+)/i);
    if (hdrMatch) {
      const title = hdrMatch[1].replace(/:$/, '').trim();
      const lines = hdrMatch[2].split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
      if (lines.length >= 2) { poems.push({ title, lines, body: lines.join('\n') }); continue; }
    }

    // Format B: first line is title
    const allLines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    if (allLines.length >= 3 && allLines[0].length < 60 && !/^\d/.test(allLines[0])) {
      poems.push({ title: allLines[0], lines: allLines.slice(1), body: allLines.slice(1).join('\n') });
    }
  }
  return poems;
}

/**
 * Run the full 8-agent pipeline to generate 1 lesson with an image.
 */
export async function generateBatchLessons({ subject, grade, level, chapter, resources = [], prompt = '', poemCount = 2, vocabCount = 6, storyDepth = 1, promptCount = 3, contentType = 'lesson', onProgress }) {
  const progress = onProgress || (() => {});
  const startTime = Date.now();

  // Detect story mode: explicit flag OR chapter/topic hints
  const isStory = contentType === 'story' ||
    /story|fiction|narrative/i.test(`${chapter} ${prompt}`);

  if (isStory) {
    return generateStoryLesson({ subject, grade, level, chapter, resources, prompt, vocabCount, onProgress: progress });
  }

  try {
    // ─── Stage 1: Planner Agent ───
    progress('planner', 5, 'Planning lesson outline...');
    const lessonPlans = await runPlannerAgent({ subject, grade, level, chapter, resources, prompt });
    const plan = lessonPlans[0];
    progress('planner', 12, `Planned: "${plan.title}"`);

    // ─── Stage 2: Content Writer Agent ───
    progress('content', 15, 'Writing lesson content...');
    const content = await runContentWriterAgent(plan, grade, subject, prompt, poemCount, vocabCount);
    progress('content', 30, 'Content written');

    // ─── Extract poem texts for poetry lessons (used by all downstream agents) ───
    const isPoetry = /poem|rhyme|poetry|rhythm|verse/i.test(`${plan.title} ${(plan.keyTopics || []).join(' ')}`);
    const poemTexts = isPoetry ? extractPoemTexts(content.workedExamples || []) : [];
    if (isPoetry && poemTexts.length > 0) {
      console.log(`  📚 Extracted ${poemTexts.length} poem(s): ${poemTexts.map(p => `"${p.title}"`).join(', ')}`);
    }

    // ─── Stage 3-5: Practice + Assessment + Resource (parallel) ───
    progress('content', 32, 'Creating exercises, assessment & resources...');
    const [practice, assessment, resourceData] = await Promise.all([
      runPracticeAgent(plan, content, grade, poemTexts),
      runAssessmentAgent(plan, content, grade, poemTexts),
      runResourceAgent(plan, content, grade, resources),
    ]);
    progress('content', 55, 'Exercises, assessment & resources ready');

    const rawLesson = {
      title: plan.title,
      objectives: plan.objectives,
      duration: plan.duration,
      difficulty: plan.difficulty,
      description: plan.description,
      keyTopics: plan.keyTopics,
      content,
      practice,
      assessment,
      resources: resourceData,
    };

    // ─── Stage 6: Image Prompt Agent (uses actual poem text) ───
    progress('images', 58, 'Creating image descriptions...');
    const imagePromptResult = await runImagePromptAgent(
      [{ ...plan, poemCount: isPoetry ? poemTexts.length : 0 }],
      grade, subject,
      poemTexts
    );
    const imagePrompts = imagePromptResult.imagePrompts || imagePromptResult;
    const promptData = Array.isArray(imagePrompts) && imagePrompts[0] ? imagePrompts[0] : {};
    const coverPrompt = promptData.coverPrompt || `${plan.title} educational illustration for Grade ${grade}`;
    const poemPrompts = Array.isArray(promptData.poemPrompts) ? promptData.poemPrompts : [];

    // ─── Stage 6b: Generate cover image ───
    progress('images', 62, 'Generating lesson cover image...');
    const coverImage = await generateImage(coverPrompt);
    rawLesson.images = { cover: coverImage, content: [], poems: [] };
    progress('images', 68, 'Cover image generated');

    // ─── Stage 6c: Generate per-poem images ───
    if (isPoetry && poemPrompts.length > 0) {
      progress('images', 70, `Generating ${poemPrompts.length} poem images...`);
      const poemImages = [];
      for (let pi = 0; pi < poemPrompts.length; pi++) {
        try {
          const pImg = await generateImage(poemPrompts[pi]);
          poemImages.push(pImg);
          progress('images', 70 + Math.floor((pi + 1) / poemPrompts.length * 5), `Poem image ${pi + 1}/${poemPrompts.length} ready`);
        } catch (imgErr) {
          console.warn(`  ⚠️ Poem image ${pi + 1} failed:`, imgErr.message);
          poemImages.push(null);
        }
      }
      rawLesson.images.poems = poemImages;
    }
    progress('images', 75, 'Images ready');

    // ─── Stage 7: QA Agent ───
    progress('qa', 78, 'Quality checking lesson...');
    const qaResult = await runQAAgent(rawLesson, grade);
    rawLesson.qaResult = qaResult;
    if (qaResult.issues && qaResult.issues.length > 0) {
      console.log(`  ⚠️ QA issues: ${qaResult.issues.join(', ')}`);
    }
    progress('qa', 88, 'Quality check passed');

    // ─── Stage 8: Formatter Agent ───
    progress('formatter', 90, 'Formatting into textbook layout...');
    const formatted = await runFormatterAgent(rawLesson, grade, subject, level);

    // Preserve images after formatting
    if (!formatted.images || !formatted.images.cover) {
      formatted.images = rawLesson.images;
    } else if (rawLesson.images?.poems?.length) {
      formatted.images.poems = rawLesson.images.poems;
    }

    // Always restore original poems — formatter may reformat them
    if (Array.isArray(content.workedExamples) && content.workedExamples.length > 0) {
      formatted.workedExamples = content.workedExamples;
    }

    // Preserve poemSummaries from contentWriter
    if (Array.isArray(content.poemSummaries) && content.poemSummaries.length > 0) {
      formatted.poemSummaries = content.poemSummaries;
    }

    // Preserve keyTopics for frontend poetry detection
    if (!formatted.keyTopics && plan.keyTopics) {
      formatted.keyTopics = plan.keyTopics;
    }

    formatted.resourceSections = resourceData;
    formatted.lessonNumber = 1;

    progress('complete', 100, 'Lesson ready!');

    const totalTime = Date.now() - startTime;
    console.log(`🎉 Pipeline complete: 1 lesson in ${Math.round(totalTime / 1000)}s`);

    return [formatted];
  } catch (error) {
    console.error('Pipeline error:', error);
    progress('error', 0, `Error: ${error.message}`);
    throw error;
  }
}

/**
 * Story-specific pipeline: plan → storyWriter → image → done.
 */
async function generateStoryLesson({ subject, grade, level, chapter, resources, prompt, vocabCount, onProgress }) {
  const progress = onProgress || (() => {});
  const startTime = Date.now();
  try {
    // ─── Stage 1: Planner ───
    progress('planner', 5, 'Planning story outline...');
    const plans = await runPlannerAgent({ subject, grade, level, chapter, resources, prompt });
    const plan = plans[0];
    progress('planner', 15, `Story planned: "${plan.title}"`);

    // ─── Stage 2: Story Writer ───
    progress('content', 18, 'Writing story...');
    const storyData = await runStoryWriterAgent(plan, grade, subject, prompt, vocabCount);
    progress('content', 50, 'Story written');

    // ─── Stage 3: Image generation ───
    progress('images', 55, 'Generating story image...');
    const imgPrompt = `Children's storybook illustration: ${storyData.title}. Characters: ${(storyData.characters || []).join(', ')}. Setting: ${storyData.setting || chapter}. Colorful, warm, child-friendly, Grade ${grade}.`;
    let coverImage = null;
    try {
      coverImage = await generateImage(imgPrompt);
      progress('images', 75, 'Story image ready');
    } catch (e) {
      console.warn('  ⚠️ Story image failed:', e.message);
    }

    // ─── Assemble final lesson object ───
    const formatted = {
      // identity
      contentType: 'story',
      title: storyData.title || plan.title,
      keyTopics: plan.keyTopics || [],
      description: storyData.storySummary || plan.description || '',
      objectives: plan.objectives || [],
      duration: plan.duration || '40 minutes',
      difficulty: plan.difficulty || level,

      // story-specific
      storySummary: storyData.storySummary || '',
      paragraphs: storyData.paragraphs || [],
      moral: storyData.moral || '',
      characters: storyData.characters || [],
      setting: storyData.setting || '',
      storyQuestions: storyData.storyQuestions || [],
      keyVocabulary: storyData.keyVocabulary || [],
      teacherNotes: storyData.teacherNotes || '',

      // shared fields (keep compatible with lesson view)
      workedExamples: [],
      images: { cover: coverImage, content: [], poems: [] },
      lessonNumber: 1,
    };

    progress('complete', 100, 'Story ready!');
    const totalTime = Date.now() - startTime;
    console.log(`📖 Story pipeline complete: "${formatted.title}" in ${Math.round(totalTime / 1000)}s`);

    return [formatted];
  } catch (error) {
    console.error('Story pipeline error:', error);
    progress('error', 0, `Error: ${error.message}`);
    throw error;
  }
}
