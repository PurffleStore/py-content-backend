import { callClaude } from '../../utils/agentHelpers.js';

// Maps UI resource card names → JSON field keys
const RESOURCE_TYPE_MAP = {
  'Educational Videos': 'educationalVideos',
  'Teaching Aids': 'teachingAids',
  'Printable Activities': 'printableActivities',
  'Research Articles': 'researchArticles',
  'Multimedia Content': 'multimediaContent',
  'Worksheets Pack': 'worksheetsPack',
};

// Schema and instructions for each resource type
const RESOURCE_SPECS = {
  educationalVideos: {
    schema: `"educationalVideos": [
    { "title": "Video Title", "description": "What this video covers and why it helps students", "searchQuery": "exact YouTube search terms to find it", "duration": "~5 minutes" }
  ]`,
    instruction: '- educationalVideos: 2-3 suggested videos with YouTube-searchable titles and search queries',
  },
  teachingAids: {
    schema: `"teachingAids": [
    { "name": "Aid Name", "description": "What this aid is and its purpose", "materials": "Materials needed to create it", "howToUse": "Step-by-step instructions for using it in class" }
  ]`,
    instruction: '- teachingAids: 2-3 physical/visual aids (flashcards, posters, charts, manipulatives) with full how-to instructions',
  },
  printableActivities: {
    schema: `"printableActivities": [
    { "title": "Activity Title", "type": "worksheet|game|puzzle", "instructions": "Clear student-facing instructions", "content": "Complete ready-to-print content with all questions, blanks, or activity details" }
  ]`,
    instruction: '- printableActivities: 2 complete printable activities with full content (not placeholders)',
  },
  researchArticles: {
    schema: `"researchArticles": [
    { "title": "Article or Book Title", "summary": "2-sentence summary of what students learn", "keyPoints": ["key learning point 1", "key learning point 2", "key learning point 3"], "readingLevel": "Grade level appropriateness" }
  ]`,
    instruction: '- researchArticles: 2-3 age-appropriate reading resources (books, articles, encyclopedias) with summaries',
  },
  multimediaContent: {
    schema: `"multimediaContent": [
    { "type": "animation|podcast|interactive|song|game", "title": "Content Title", "description": "What this covers and why it engages students", "suggestion": "Specific tip for using this in your lesson" }
  ]`,
    instruction: '- multimediaContent: 2-3 multimedia resources (animations, songs, interactive games, podcasts)',
  },
  worksheetsPack: {
    schema: `"worksheetsPack": {
    "title": "Worksheet Pack Title",
    "sections": [
      { "name": "Section Name", "instructions": "Instructions for this section", "exercises": ["complete exercise 1 text", "complete exercise 2 text", "complete exercise 3 text"] }
    ]
  }`,
    instruction: '- worksheetsPack: 3 sections (Guided Practice, Independent Practice, Challenge) with 3 full exercises each',
  },
};

function buildPrompts(lessonPlan, content, grade, resources) {
  // Map UI names to field keys, filter valid ones
  const selectedKeys = resources.map(r => RESOURCE_TYPE_MAP[r]).filter(Boolean);

  // Always include teacher guide + notes
  const schemaLines = [
    '  "teacherGuide": "Detailed step-by-step lesson delivery guide with timing for each section"',
    '  "teacherNotes": "Quick classroom tips and common student misconceptions to watch for"',
  ];
  const instructionLines = [
    '- teacherGuide: full delivery guide with approximate timing (e.g., "5 min warm-up", "15 min explanation")',
    '- teacherNotes: 3-5 practical tips and misconceptions',
  ];

  selectedKeys.forEach(key => {
    const spec = RESOURCE_SPECS[key];
    if (spec) {
      schemaLines.push(`  ${spec.schema}`);
      instructionLines.push(spec.instruction);
    }
  });

  const systemPrompt = `You are an expert educational resource creator for Grade ${grade}. Create practical, ready-to-use teaching resources.

Return ONLY valid JSON (no markdown, no explanation) with exactly these fields:
{
${schemaLines.join(',\n')}
}

Guidelines:
${instructionLines.join('\n')}
- All content must be appropriate for Grade ${grade} students
- Be specific and complete — teachers should be able to use this immediately
- No placeholder text like "add content here"`;

  const contentSummary = typeof content.mainExplanation === 'string'
    ? content.mainExplanation.substring(0, 400)
    : '';

  const userPrompt = `Create teaching resources for this Grade ${grade} lesson:

Title: "${lessonPlan.title}"
Objectives: ${lessonPlan.objectives.join('; ')}
Key topics: ${(lessonPlan.keyTopics || []).join(', ')}
Content summary: ${contentSummary}
Requested resource types: ${resources.length > 0 ? resources.join(', ') : 'Teacher Guide only'}

Return ONLY the JSON object.`;

  return { systemPrompt, userPrompt, selectedKeys };
}

export async function runResourceAgent(lessonPlan, content, grade, resources) {
  const { systemPrompt, userPrompt, selectedKeys } = buildPrompts(lessonPlan, content, grade, resources);

  const resourceLabel = resources.length > 0 ? resources.join(', ') : 'default resources';
  console.log(`📦 Resource Agent: Generating [${resourceLabel}]...`);

  const result = await callClaude(systemPrompt, userPrompt, 5000);

  if (typeof result === 'string') {
    return {
      teacherGuide: result,
      teacherNotes: 'Follow the teacher guide for delivery tips.',
    };
  }

  // Ensure teacherGuide and teacherNotes always exist
  return {
    teacherGuide: result.teacherGuide || '',
    teacherNotes: result.teacherNotes || '',
    ...selectedKeys.reduce((acc, key) => {
      if (result[key] !== undefined) acc[key] = result[key];
      return acc;
    }, {}),
  };
}
