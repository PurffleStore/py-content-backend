import { callClaude } from '../../utils/agentHelpers.js';

/* ── Grade-level spec ─────────────────────────────────────────────────────── */
function getGradeSpec(grade) {
  const g = String(grade).toLowerCase();
  if (['prek','pre-k','k'].includes(g) || g === '1' || g === '2') {
    return {
      tier: 'beginner',
      duration: '30–35 minutes',
      objectives: 3,
      sections: ['Learning Objectives','Key Vocabulary','Warm-Up Activity','Poem / Short Text 1','Poem / Short Text 2','Explanation (very short)','Practice Exercises','Quiz','Creative Activity'],
    };
  }
  if (g === '3' || g === '4') {
    return {
      tier: 'elementary',
      duration: '35–40 minutes',
      objectives: 4,
      sections: ['Learning Objectives','Key Vocabulary','Warm-Up Activity','Main Content / Poems','Explanation','Worked Examples','Practice Exercises','Quiz','Creative Activity'],
    };
  }
  if (g === '5' || g === '6') {
    return {
      tier: 'intermediate',
      duration: '40–45 minutes',
      objectives: 4,
      sections: ['Learning Objectives','Key Vocabulary','Warm-Up','Main Content','Explanation','Worked Examples','Practice','Assessment Quiz','Reflection'],
    };
  }
  return {
    tier: 'upper',
    duration: '45–50 minutes',
    objectives: 5,
    sections: ['Learning Objectives','Key Vocabulary','Warm-Up','Main Content','Detailed Explanation','Worked Examples','Practice Exercises','Assessment Quiz','Extension Activity'],
  };
}

const SYSTEM_PROMPT = `You are an expert curriculum planner for K-12 education. You create grade-appropriate lesson plans.

You must return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "lessons": [
    {
      "lessonNumber": 1,
      "title": "Lesson Title",
      "objectives": ["objective 1", "objective 2", "objective 3"],
      "duration": "35 minutes",
      "difficulty": "easy|medium|hard",
      "sectionOutline": ["Section 1", "Section 2"],
      "description": "A 1-2 sentence description suitable for the grade level.",
      "keyTopics": ["topic1", "topic2"]
    }
  ]
}

CRITICAL: Match ALL content to the grade level. Young learners (Grade 1-3) need very simple, short, fun lessons. Older students (Grade 7+) can handle more detail.`;

export async function runPlannerAgent({ subject, grade, level, chapter, resources, prompt = '' }) {
  const spec = getGradeSpec(grade);

  const customInstruction = prompt
    ? `\n⭐ TEACHER REQUEST: "${prompt}" — Build the lesson around this idea.`
    : '';

  const userPrompt = `Create 1 lesson plan for:
- Subject: ${subject}
- Grade: Grade ${grade} (${spec.tier} level)
- Level: ${level}
- Chapter/Topic: ${chapter}
- Duration: ${spec.duration}
- Number of objectives: exactly ${spec.objectives}
- Required sections: ${spec.sections.join(', ')}
${resources.length > 0 ? `- Resources: ${resources.join(', ')}` : ''}${customInstruction}

The sectionOutline MUST follow this order: ${spec.sections.join(' → ')}
Return ONLY the JSON object.`;

  console.log('📋 Planner Agent: Creating lesson outline...');
  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 1500);

  if (typeof result === 'string') {
    throw new Error('Planner Agent returned non-JSON response');
  }

  const lessons = result.lessons || (Array.isArray(result) ? result : [result]);
  if (!Array.isArray(lessons) || lessons.length < 1) {
    throw new Error('Planner Agent returned no lesson');
  }

  // Attach spec so other agents can use it
  lessons[0]._gradeSpec = spec;

  console.log(`📋 Planner Agent: Created lesson outline — "${lessons[0].title}"`);
  return lessons.slice(0, 1);
}
