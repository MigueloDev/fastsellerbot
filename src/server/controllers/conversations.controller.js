import { resumeConversation } from '../../context/redis.js'
import {
  getConversations,
  getMessages,
  updateConversationStatus,
  saveMessage,
} from '../../db/conversations.js'
import { enqueueMessage } from '../../queue/producer.js'
import { getIO } from '../fastify.js'
import {
  EVENTS,
  buildNewMessage,
  buildConversationUpdated,
  buildStatusChanged,
} from '../events.js'

export async function list(request, reply) {
  try {
    return await getConversations()
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function messages(request, reply) {
  try {
    const jid = decodeURIComponent(request.params.jid)
    return await getMessages(jid)
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function patchStatus(request, reply) {
  try {
    const jid = decodeURIComponent(request.params.jid)
    await updateConversationStatus(jid, request.body.status)
    if (request.body.status === 'bot') {
      await resumeConversation(jid)
    }
    getIO()?.emit(
      EVENTS.CONVERSATION_STATUS_CHANGED,
      buildStatusChanged({
        jid,
        status: request.body.status,
        updatedBy: request.user?.name ?? 'agent',
      }),
    )
    getIO()?.emit(
      EVENTS.CONVERSATION_UPDATED,
      buildConversationUpdated({ jid, status: request.body.status }),
    )
    return { ok: true }
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function send(request, reply) {
  try {
    const { jid, text } = request.body
    if (!jid || !text) {
      reply.status(400).send({ error: 'jid y text son requeridos' })
      return
    }
    const agentName = request.user?.name ?? 'Agente'

    await enqueueMessage(jid, text, 'manual')

    const savedMsg = await saveMessage({
      jid,
      direction: 'outbound',
      text,
      intent: null,
      origin: 'manual',
      agentName,
    })

    getIO()?.to(jid).emit(
      EVENTS.NEW_MESSAGE,
      buildNewMessage({
        id: savedMsg?.id,
        conversationId: savedMsg?.conversationId,
        jid,
        direction: 'outbound',
        text,
        origin: 'manual',
        agentName,
      }),
    )
    getIO()?.emit(
      EVENTS.CONVERSATION_UPDATED,
      buildConversationUpdated({ jid, lastMessage: text, updatedBy: agentName }),
    )

    reply.send({ ok: true, queued: true, agent: agentName })
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}
