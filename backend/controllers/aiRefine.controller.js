import OpenAI from 'openai';
import { z } from 'zod';

const refineReferenceSchema = z.object({
  experience: z.object({
    role: z.string().min(1, 'role is required'),
    company: z.string().min(1, 'company is required'),
    startDate: z.string().min(1, 'startDate is required'),
    endDate: z.string().min(1, 'endDate is required'),
    visibility: z.string().optional().default('DEFAULT')
  }),
  draft: z.string().min(20, 'draft must be at least 20 characters')
});

function sanitizeMessage(message) {
  if (!message) return 'Internal server error';

  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/OPENAI_API_KEY/gi, '[REDACTED]');
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const client = new OpenAI({ apiKey });

  // Defensive normalization for ESM/Jest interop cases
  if (client?.chat?.completions?.create) {
    return client;
  }

  if (client?.default?.chat?.completions?.create) {
    return client.default;
  }

  return client;
}

function getCreateCompletionFn(client) {
  if (typeof client?.chat?.completions?.create === 'function') {
    return client.chat.completions.create.bind(client.chat.completions);
  }

  if (typeof client?.default?.chat?.completions?.create === 'function') {
    return client.default.chat.completions.create.bind(client.default.chat.completions);
  }

  return null;
}

function buildMessages({ experience, draft }) {
  const visibility = experience.visibility || 'DEFAULT';

  return [
    {
      role: 'system',
      content:
        'You are an expert editorial assistant for professional references. Rewrite referee feedback to improve clarity, professionalism, specificity, and usefulness while preserving the original meaning. Return valid JSON with keys "refined" and "flags". "refined" must be a string. "flags" must be an array of objects with keys "type", "excerpt", and "suggestion".'
    },
    {
      role: 'user',
      content: [
        'Please refine the following professional reference draft.',
        '',
        `Role: ${experience.role}`,
        `Company: ${experience.company}`,
        `Start Date: ${experience.startDate}`,
        `End Date: ${experience.endDate}`,
        `Visibility: ${visibility}`,
        '',
        'Draft:',
        draft
      ].join('\n')
    }
  ];
}

function parseAiPayload(content) {
  if (!content || typeof content !== 'string') {
    return {
      ok: false,
      status: 502,
      body: {
        error: 'AI service error',
        message: 'AI service returned empty response'
      }
    };
  }

  try {
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed.refined !== 'string' || !Array.isArray(parsed.flags)) {
      return {
        ok: false,
        status: 502,
        body: {
          error: 'AI service error',
          message: 'AI service returned malformed response'
        }
      };
    }

    return {
      ok: true,
      data: {
        refined: parsed.refined,
        flags: parsed.flags
      }
    };
  } catch {
    return {
      ok: false,
      status: 502,
      body: {
        error: 'AI service error',
        message: 'AI service returned invalid JSON',
        rawSnippet: content.slice(0, 300)
      }
    };
  }
}

export async function refineReference(req, res) {
  const parsed = refineReferenceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.flatten()
    });
  }

  const { experience, draft } = parsed.data;

  const openai = getOpenAIClient();

  if (!openai) {
    return res.status(503).json({
      error: 'OpenAI configuration error',
      message: 'AI refinement service configuration is unavailable'
    });
  }

  const createCompletion = getCreateCompletionFn(openai);

  if (!createCompletion) {
    return res.status(503).json({
      error: 'OpenAI configuration error',
      message: 'AI refinement service configuration is unavailable'
    });
  }

  try {
    const completion = await createCompletion({
      model: 'gpt-4.1-mini',
      messages: buildMessages({ experience, draft }),
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' }
    });

    if (!completion?.choices || completion.choices.length === 0) {
      return res.status(502).json({
        error: 'AI service error',
        message: 'AI service returned empty response'
      });
    }

    const content = completion?.choices?.[0]?.message?.content;
    const parsedAi = parseAiPayload(content);

    if (!parsedAi.ok) {
      return res.status(parsedAi.status).json(parsedAi.body);
    }

    return res.status(200).json(parsedAi.data);
  } catch (error) {
    const sanitizedMessage = sanitizeMessage(error?.message);

    if (error?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Rate limit exceeded for AI refinement service'
      });
    }

    if (error?.status === 401 || error?.status === 403) {
      return res.status(503).json({
        error: 'OpenAI configuration error',
        message: 'AI refinement service configuration is unavailable'
      });
    }

    if (
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ECONNRESET' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNREFUSED'
    ) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'AI refinement service is temporarily unavailable'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: sanitizedMessage
    });
  }
}

export default {
  refineReference
};