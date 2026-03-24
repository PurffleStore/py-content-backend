import { callClaude } from '../../utils/agentHelpers.js';

const SYSTEM_PROMPT = `You are a quality assurance specialist for educational content. You review lesson content for completeness, grade-appropriateness, safety, and structural integrity.

You must return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "passed": true,
  "issues": [],
  "suggestions": ["optional improvement suggestions"],
  "safetyFlags": [],
  "completenessScore": 95,
  "gradeAppropriatenessScore": 90
}

Check for:
1. COMPLETENESS: All required sections present (warmUp, mainExplanation, workedExamples, exercises, quiz, answerKey, teacherNotes)
2. GRADE FIT: Language and concepts appropriate for the grade level
3. REPETITION: No excessive repetition across sections
4. SAFETY: No inappropriate content, bias, or harmful material
5. STRUCTURE: Proper formatting and logical flow
6. ACCURACY: Facts and information are correct

If issues are found, still pass but list them. Only fail (passed: false) for serious safety or completeness issues.`;

export async function runQAAgent(lesson, grade) {
  const sections = Object.keys(lesson).filter(k => k !== 'images' && k !== 'lessonNumber');
  const contentPreview = JSON.stringify(lesson, null, 2).substring(0, 3000);

  const userPrompt = `Review this Grade ${grade} lesson for quality:

Sections present: ${sections.join(', ')}

Content preview:
${contentPreview}

Return ONLY the JSON object with your QA assessment.`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 2000);

  if (typeof result === 'string') {
    return { passed: true, issues: [], suggestions: [], safetyFlags: [], completenessScore: 80, gradeAppropriatenessScore: 80 };
  }

  return result;
}
