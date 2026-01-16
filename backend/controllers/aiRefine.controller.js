/**
 * AI Reference Refinement Controller
 * Handles AI-powered editorial refinement of referee feedback
 */

import OpenAI from 'openai';
import logger from '../logger.js';

const buildOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
};

// Get model from env or use default
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// System prompt for the AI refinement tool
const SYSTEM_PROMPT = `You are HRKey Reference Copilot.

IMPORTANT:
You are NOT a conversational assistant.
You do NOT perform onboarding.
You do NOT ask for basic context if it has already been provided.

This tool is triggered AFTER the referee has already begun writing feedback.

Your responsibility is to help a professional (the referee) refine and structure
a work reference that already exists, anchored to a specific professional experience.

This reference is tied to a defined role, company, and time period from the
candidate's CV.

Your role is strictly editorial, professional, and risk-aware.

This is NOT performance scoring.
This is NOT career coaching.
This is NOT motivational writing.
This is NOT a personality assessment.
This is NOT an automated evaluation.

CONTEXT PROVIDED (ALREADY AVAILABLE)
Assume the following context is already known and must be respected:
- Role / Position
- Company / Organization
- Time period (start date – end date or "present")
- Visibility constraint (if any)

Do NOT ask the user to restate this information.

LEGAL, VISIBILITY & RISK CONSTRAINTS
Some referees may be subject to company or legal restrictions.

If potentially sensitive or confidential company information is detected:
- Do NOT remove or censor content automatically.
- Do NOT accuse or warn about legal violations.
- Calmly flag the content as potentially sensitive.
- Briefly explain why it may pose a risk if shared externally.
- Suggest a safer reformulation focused on observable behavior or outcomes.
- Leave the final decision entirely to the referee.

Never imply company endorsement, approval, or awareness of the reference.

WORKFLOW
- Rewrite into a clearer, professional, well-structured reference.
- If bullet points, organize them.
- If insufficient info, ask ONLY focused follow-up questions about observable actions.

OUTPUT
Return ONLY valid JSON with this schema:
{
  "refined": "string",
  "flags": [
    {
      "type": "POTENTIALLY_SENSITIVE_COMPANY_INFO" | "LEGAL_VISIBILITY_RISK" | "LOW_SPECIFICITY",
      "excerpt": "string",
      "suggestion": "string"
    }
  ]
}
No markdown. No extra text. Only JSON.`;

/**
 * Build user message from experience context and draft
 */
function buildUserMessage(experience, draft) {
  const { role, company, startDate, endDate, visibility = 'DEFAULT' } = experience;

  return `Experience Context:
- Role: ${role}
- Company: ${company}
- Period: ${startDate} – ${endDate}
- Visibility constraint: ${visibility}

Referee draft (rewrite/refine this; do not ask for onboarding info):
${draft}`;
}

/**
 * POST /api/ai/reference/refine
 * Refines referee feedback using OpenAI
 */
export async function refineReference(req, res) {
  const requestId = req.requestId;

  try {
    const { experience, draft } = req.body;

    const openai = buildOpenAIClient();
    if (!openai) {
      logger.error('OpenAI API key not configured', { requestId });
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'AI refinement service is not configured. Please contact the administrator.'
      });
    }

    // Build the user message
    const userMessage = buildUserMessage(experience, draft);

    logger.info('AI refinement request started', {
      requestId,
      userId: req.user?.id,
      draftLength: draft.length,
      role: experience.role,
      company: experience.company
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' }
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      logger.error('OpenAI returned empty response', { requestId });
      return res.status(502).json({
        error: 'AI service error',
        message: 'AI service returned an empty response'
      });
    }

    // Parse JSON response
    let aiResponse;
    try {
      aiResponse = JSON.parse(responseContent);
    } catch (parseError) {
      logger.error('Failed to parse OpenAI JSON response', {
        requestId,
        error: parseError.message,
        responseSnippet: responseContent.substring(0, 200)
      });
      return res.status(502).json({
        error: 'AI service error',
        message: 'AI service returned invalid JSON',
        rawSnippet: responseContent.substring(0, 200)
      });
    }

    // Validate response structure
    if (!aiResponse.refined || typeof aiResponse.refined !== 'string') {
      logger.error('OpenAI response missing refined field', {
        requestId,
        response: aiResponse
      });
      return res.status(502).json({
        error: 'AI service error',
        message: 'AI service returned malformed data'
      });
    }

    // Ensure flags array exists
    if (!Array.isArray(aiResponse.flags)) {
      aiResponse.flags = [];
    }

    logger.info('AI refinement completed successfully', {
      requestId,
      userId: req.user?.id,
      refinedLength: aiResponse.refined.length,
      flagsCount: aiResponse.flags.length
    });

    // Return the refined content and flags
    return res.json({
      refined: aiResponse.refined,
      flags: aiResponse.flags
    });

  } catch (error) {
    // Handle OpenAI API errors
    if (error.status === 401) {
      logger.error('OpenAI API authentication failed', {
        requestId,
        error: error.message
      });
      return res.status(503).json({
        error: 'Service configuration error',
        message: 'AI service authentication failed'
      });
    }

    if (error.status === 429) {
      logger.warn('OpenAI API rate limit exceeded', {
        requestId,
        error: error.message
      });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'AI service is temporarily unavailable due to high demand. Please try again later.'
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logger.error('OpenAI API connection failed', {
        requestId,
        error: error.message,
        code: error.code
      });
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'AI service is temporarily unavailable'
      });
    }

    // Generic error handler
    logger.error('AI refinement failed', {
      requestId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to refine reference. Please try again later.'
    });
  }
}

export default {
  refineReference
};
