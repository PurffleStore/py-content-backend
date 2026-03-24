import { callClaude } from '../utils/agentHelpers.js';
import { CURRICULUM_DATA } from '../utils/curriculumData.js';

export async function generateLesson({ chapter, lesson, grade = '3', subject = 'english', level = 'medium', resources = [], options = {} }) {
  try {
    // Get lesson details from curriculum data
    const chapterData = CURRICULUM_DATA.find(ch => ch.id === chapter);
    if (!chapterData) {
      throw new Error(`Chapter ${chapter} not found`);
    }

    const lessonData = chapterData.lessons.find(l => l.id === lesson);
    if (!lessonData) {
      throw new Error(`Lesson ${lesson} not found in Chapter ${chapter}`);
    }

    console.log(`Generating: ${lessonData.topic}`);
    console.log(`   Grade: ${grade}, Subject: ${subject}, Level: ${level}`);
    if (resources.length > 0) {
      console.log(`   Resources to include: ${resources.join(', ')}`);
    }

    // Build prompt and generate content via OpenAI-first helper
    const prompt = buildLessonPrompt(chapterData, lessonData, { grade, subject, level, resources, ...options });
    const systemPrompt = 'You are an expert English language teacher creating structured, engaging lessons for grade-school students.';
    const response = await callClaude(systemPrompt, prompt, 4000);

    const generatedContent = typeof response === 'string'
      ? response
      : (response?.fullContent || JSON.stringify(response, null, 2));

    const lesson_content = parseGeneratedContent(generatedContent);

    return {
      chapter: chapterData.name,
      lesson: lessonData.topic,
      objectives: lessonData.objectives,
      estimatedTime: lessonData.estimatedTime,
      content: lesson_content,
      metadata: {
        tokenUsage: {
          input: null,
          output: null,
        },
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
        timestamp: new Date().toISOString(),
        grade,
        subject,
        level,
        selectedResources: resources,
      },
    };
  } catch (error) {
    console.error('Lesson generation error:', error);
    throw error;
  }
}

function buildLessonPrompt(chapter, lesson, options) {
  const { style = 'formal', language = 'simple', grade = '3', subject = 'english', level = 'medium', resources = [] } = options;

  // Build resource-specific instructions
  let resourceInstructions = '';
  if (resources.length > 0) {
    resourceInstructions = '\n**ADDITIONAL RESOURCES TO INCLUDE:**\n';

    const resourceDetails = {
      worksheet: '- Include printable worksheets with fill-in-the-blank and matching activities',
      guide: "- Include detailed teacher\'s guide with step-by-step teaching instructions, classroom management tips, and common misconceptions",
      exercises: '- Include 5-7 comprehensive practice exercises with answer keys and difficulty levels (easy, medium, challenging)',
      videos: '- Include descriptions of video resources that could accompany this lesson, with timestamps and discussion questions',
      assessment: '- Include quiz questions, formative assessment strategies, and rubrics for evaluating student understanding',
      rubric: '- Include a detailed grading rubric with criteria, proficiency levels, and point distributions',
      multimedia: '- Include interactive multimedia content suggestions, digital tool recommendations, and online resource links',
      references: '- Include a comprehensive list of reference materials, recommended books, websites, and additional reading materials'
    };

    resources.forEach(resource => {
      if (resourceDetails[resource]) {
        resourceInstructions += resourceDetails[resource] + '\n';
      }
    });
  }

  return `You are an expert English language teacher creating engaging lessons for Grade ${grade} (8-9 year old) students.

Generate a comprehensive, high-quality English lesson with the following details:

**Category:** ${chapter.name}
**Lesson Topic:** ${lesson.topic}
**Learning Objectives:**
${lesson.objectives.map(obj => `- ${obj}`).join('\n')}
**Estimated Duration:** ${lesson.estimatedTime}
**Difficulty Level:** ${level.charAt(0).toUpperCase() + level.slice(1)}

IMPORTANT: Create content that is:
- Appropriate for general Grade ${grade} English learners worldwide
- Engaging and interesting for 8-9 year olds
- Clear, simple language without being condescending
- Inclusive and culturally diverse examples
- Aligned with the ${level} difficulty level

Please create a lesson that includes:

1. **Introduction** (2-3 engaging sentences about the topic)
2. **Main Concept** (Clear, simple explanation with visual/concrete references where applicable)
3. **Examples** (3-4 real-world, relatable examples for Grade ${grade} students)
4. **Learning Activities** (2-3 interactive, hands-on activities)
5. **Vocabulary** (5-7 key words with simple, child-friendly definitions)
6. **Practice Exercises** (5-7 exercises: 2-3 easy, 2-3 medium, 1-2 challenging)
7. **Assessment Questions** (3-4 questions to check understanding)
8. **Teacher Notes** (Brief tips for educators on delivery and engagement)
${resourceInstructions}

**Style:** ${style}
**Language Level:** ${language}
**Target Age:** 8-9 years old (Grade ${grade})
**Subject Area:** ${subject}

Format the output as clear sections with headers. Ensure all content is age-appropriate, engaging, and promotes confidence in language learning.${resources.length > 0 ? '\n\nIMPORTANT: Make sure to include the additional resources requested above in their respective sections.' : ''}`;
}

function parseGeneratedContent(content) {
  // Simple parsing - can be enhanced based on response structure
  const sections = {
    introduction: extractSection(content, 'Introduction'),
    mainConcept: extractSection(content, 'Main Concept'),
    examples: extractSection(content, 'Examples'),
    activities: extractSection(content, 'Learning Activities'),
    vocabulary: extractSection(content, 'Vocabulary'),
    exercises: extractSection(content, 'Practice Exercises'),
    assessment: extractSection(content, 'Assessment Questions'),
    fullContent: content,
  };

  return sections;
}

function extractSection(content, sectionName) {
  const regex = new RegExp(`\\*\\*${sectionName}\\*\\*[\\s\\S]*?(?=\\*\\*|$)`, 'i');
  const match = content.match(regex);
  return match ? match[0].replace(/\*\*/g, '').trim() : '';
}
