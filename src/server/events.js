export const EVENTS = {
  NEW_MESSAGE: 'new_message',
  CONVERSATION_UPDATED: 'conversation_updated',
  CONVERSATION_STATUS_CHANGED: 'conversation_status_changed',
  INTENT_DETECTED: 'intent_detected',
  MESSAGE_QUEUED: 'message_queued',
  BOT_STATUS: 'bot_status',
}

export function buildNewMessage({
  jid, id = null, conversationId = null,
  direction, text, origin, intent = null,
  agentName = null, createdAt = null,
}) {
  return {
    id: id ?? `temp-${Date.now()}`,
    jid,
    conversationId,
    direction,
    text,
    origin,
    intent,
    agentName,
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

export function buildConversationUpdated({
  jid, lastMessage = null, lastMessageAt = null,
  status = null, intent = null, updatedBy = 'bot',
}) {
  return {
    jid,
    lastMessage,
    lastMessageAt: lastMessageAt ?? new Date().toISOString(),
    status,
    intent,
    updatedBy,
  }
}

export function buildStatusChanged({ jid, status, updatedBy = 'agent' }) {
  return { jid, status, updatedBy }
}
