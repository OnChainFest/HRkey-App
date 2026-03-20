import {
  processUserMessage,
  startConversation
} from '../services/louAgent.service.js';

export async function startLouConversation(_req, res) {
  const conversationState = startConversation();

  return res.status(200).json({
    ok: true,
    conversationState
  });
}

export async function sendLouMessage(req, res) {
  const { conversationState, message } = req.body || {};

  if (!conversationState || typeof conversationState !== 'object') {
    return res.status(400).json({
      ok: false,
      error: 'VALIDATION_ERROR',
      message: 'conversationState is required'
    });
  }

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'VALIDATION_ERROR',
      message: 'message is required'
    });
  }

  const result = processUserMessage(conversationState, message);

  return res.status(200).json({
    ok: true,
    response: result.response,
    conversationState: result.conversationState,
    meta: result.meta
  });
}

export default {
  startLouConversation,
  sendLouMessage
};
