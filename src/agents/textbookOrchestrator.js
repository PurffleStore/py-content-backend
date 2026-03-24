import {
  getGradeTier,
  generateCompactLesson,
  generateTextbookOutline,
  generateTextbookSection,
  generateChapterSummary,
} from './pipeline/textbookContentAgent.js';

/**
 * Route based on grade:
 *   Grade 1–4 → COMPACT LESSON MODE  (1 Claude call, 11 fixed sections)
 *   Grade 5+  → CHAPTER MODE         (3-phase, 5–6 long sections)
 */
export async function generateTextbookContent({ lessonData, onProgress, onSectionComplete }) {
  const title = lessonData.title || 'Untitled Lesson';
  const grade = lessonData.grade || lessonData.formData?.grade || '3';
  const tier  = getGradeTier(grade);

  console.log(`\n📖 Textbook generation — "${title}" | Grade ${grade} | Tier: ${tier}`);

  if (tier === 'beginner' || tier === 'elementary') {
    return runCompactMode({ lessonData, grade, tier, title, onProgress, onSectionComplete });
  } else {
    return runChapterMode({ lessonData, grade, title, onProgress, onSectionComplete });
  }
}

/* ══════════════════════════════════════════════════════════════════
   COMPACT LESSON MODE  —  Grade 1–4
   One Claude call → 11 fixed lesson sections
   Fast, structured, child-appropriate output
══════════════════════════════════════════════════════════════════ */
async function runCompactMode({ lessonData, grade, tier, title, onProgress, onSectionComplete }) {

  onProgress('outline', 10, 'Preparing lesson structure...');

  let compactResult;
  try {
    onProgress('section', 30, 'Generating lesson content...');
    compactResult = await generateCompactLesson(lessonData);
    console.log(`  ✅ Compact lesson generated: ${(compactResult.sections || []).length} sections`);
  } catch (err) {
    console.error('  ❌ Compact lesson failed:', err.message);
    throw new Error(`Lesson generation failed: ${err.message}`);
  }

  const sections = compactResult.sections || [];

  // Build a tableOfContents from the 11 fixed sections
  const tableOfContents = sections.map(s => ({
    id:          s.id,
    title:       s.title,
    description: '',
    estimatedParagraphs: 1,
    subsections: [],
  }));

  const outline = {
    chapterTitle: compactResult.lessonTitle || title,
    chapterIntro: '', // No long intro for young learners
    tableOfContents,
  };

  // Stream outline to client
  onProgress('outline_complete', 40, `Lesson structure ready: ${sections.length} sections`);
  if (onSectionComplete) {
    onSectionComplete({ type: 'outline', data: outline });
  }

  // Stream each section progressively so UI shows live progress
  onProgress('section', 50, 'Streaming lesson sections...');
  for (let i = 0; i < sections.length; i++) {
    const pct = 50 + Math.round((i / sections.length) * 40);
    onProgress('section', pct, `Preparing section ${i + 1}/${sections.length}: "${sections[i].title}"`);

    if (onSectionComplete) {
      onSectionComplete({
        type:  'section',
        index: i,
        total: sections.length,
        data:  sections[i],
      });
    }
  }

  // Pull quiz/answer-key section for reviewQuestions
  const quizSection    = sections.find(s => s.type === 'quiz');
  const answerSection  = sections.find(s => s.type === 'answers');

  const summary = {
    chapterSummary:  answerSection?.content || '',
    reviewQuestions: quizSection
      ? (quizSection.content || '').split('\n').filter(l => /^\d+\./.test(l.trim())).map(l => l.replace(/^\d+\.\s*/, ''))
      : [],
  };

  if (onSectionComplete) {
    onSectionComplete({ type: 'summary', data: summary });
  }

  onProgress('complete', 100, 'Lesson content ready!');

  const result = {
    chapterTitle:    outline.chapterTitle,
    chapterIntro:    outline.chapterIntro,
    tableOfContents: outline.tableOfContents,
    sections,
    chapterSummary:  summary.chapterSummary,
    reviewQuestions: summary.reviewQuestions,
    metadata: {
      lessonTitle:   title,
      grade,
      subject:       lessonData.subject || lessonData.formData?.subject || 'English',
      totalSections: sections.length,
      mode:          'compact',
      generatedAt:   new Date().toISOString(),
    },
  };

  console.log(`\n📖 Compact lesson complete: "${result.chapterTitle}" — ${sections.length} sections`);
  return result;
}

/* ══════════════════════════════════════════════════════════════════
   CHAPTER MODE  —  Grade 5+
   3-phase pipeline: Outline → Sections → Summary
   Richer content for older students
══════════════════════════════════════════════════════════════════ */
async function runChapterMode({ lessonData, grade, title, onProgress, onSectionComplete }) {

  // Phase 1: Outline
  onProgress('outline', 5, 'Generating chapter outline...');
  let outline;
  try {
    outline = await generateTextbookOutline(lessonData);
    console.log(`  ✅ Outline: "${outline.chapterTitle}" — ${outline.tableOfContents?.length || 0} sections`);
  } catch (err) {
    console.error('  ❌ Outline failed:', err.message);
    throw new Error(`Outline generation failed: ${err.message}`);
  }

  onProgress('outline_complete', 12, `Outline ready: ${outline.tableOfContents?.length || 0} sections`);
  if (onSectionComplete) {
    onSectionComplete({ type: 'outline', data: outline });
  }

  // Phase 2: Sections
  const sections     = [];
  const totalSections = outline.tableOfContents?.length || 0;

  for (let i = 0; i < totalSections; i++) {
    const sectionPlan   = outline.tableOfContents[i];
    const progressPercent = 15 + Math.round((i / totalSections) * 75);

    onProgress('section', progressPercent, `Writing section ${i + 1}/${totalSections}: "${sectionPlan.title}"...`);

    let section;
    try {
      section = await generateTextbookSection(sectionPlan, outline, lessonData, sections);
      console.log(`  ✅ Section ${i + 1}: "${section.title}" (${(section.content || '').length} chars)`);
    } catch (err) {
      console.error(`  ❌ Section "${sectionPlan.title}" failed:`, err.message);
      section = {
        id: sectionPlan.id, title: sectionPlan.title,
        content: `This section covers ${sectionPlan.description || sectionPlan.title}.`,
        keyPoints: [], imagePrompt: null, funFact: null, subsections: [],
      };
    }

    sections.push(section);
    if (onSectionComplete) {
      onSectionComplete({ type: 'section', index: i, total: totalSections, data: section });
    }
  }

  // Phase 3: Summary
  onProgress('summary', 93, 'Writing chapter summary...');
  let summary;
  try {
    summary = await generateChapterSummary(outline, sections, lessonData);
    console.log('  ✅ Summary generated');
  } catch (err) {
    summary = {
      chapterSummary:  'Review the sections above to consolidate your understanding.',
      reviewQuestions: ['What were the main ideas?', 'What was most interesting?', 'How can you apply this?'],
    };
  }

  if (onSectionComplete) {
    onSectionComplete({ type: 'summary', data: summary });
  }

  onProgress('complete', 100, 'Textbook content ready!');

  const result = {
    chapterTitle:    outline.chapterTitle,
    chapterIntro:    outline.chapterIntro,
    tableOfContents: outline.tableOfContents,
    sections,
    chapterSummary:  summary.chapterSummary,
    reviewQuestions: summary.reviewQuestions,
    metadata: {
      lessonTitle:   title,
      grade,
      subject:       lessonData.subject || lessonData.formData?.subject || 'English',
      totalSections: sections.length,
      mode:          'chapter',
      generatedAt:   new Date().toISOString(),
    },
  };

  console.log(`\n📖 Chapter complete: "${result.chapterTitle}" — ${sections.length} sections`);
  return result;
}
