import { detectIntent } from '../ai/intent.js'
import { generateResponse, generateGreeting } from '../ai/response.js'
import { sanitizeInput } from '../ai/guardrails.js'
import { enqueueMessage } from '../queue/producer.js'
import { saveMessage, updateConversationStatus } from '../db/conversations.js'
import { getContext, addToContext, isPaused, pauseConversation } from '../context/redis.js'
import { getIO } from '../server/fastify.js'
import { EVENTS, buildNewMessage, buildConversationUpdated, buildStatusChanged } from '../server/events.js'

export async function processMessage(sock, msg) {
  try {
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      null

    if (!text) return

    const contactName = msg.pushName
    const jid = msg.key.remoteJid
    // No loguear el contenido del mensaje (PII). Solo un identificador acortado.
    console.log('🔍 Procesando mensaje de:', jid?.split('@')[0]?.slice(0, 6) + '…')

    // Verificar si la conversación está pausada
    const paused = await isPaused(jid)
    if (paused) {
      console.log('⏸️  Conversación pausada, ignorando:', jid)
      const savedPaused = await saveMessage({ jid, direction: 'inbound', text, intent: null, origin: 'client', contactName })
      await addToContext(jid, 'user', text)

      getIO()?.to(jid).emit(
        EVENTS.NEW_MESSAGE,
        buildNewMessage({
          id: savedPaused?.id,
          conversationId: savedPaused?.conversationId,
          jid, direction: 'inbound',
          text, origin: 'client',
        }),
      )
      getIO()?.emit(
        EVENTS.CONVERSATION_UPDATED,
        buildConversationUpdated({ jid, lastMessage: text, status: 'human' }),
      )
      return
    }

    // Obtener contexto de la conversación
    const history = await getContext(jid)

    // Agregar al contexto Redis
    await addToContext(jid, 'user', text)

    // Guardrails
    const guardrail = sanitizeInput(text)
    if (!guardrail.safe) {
      console.log('🛡️  Guardrails:', { jid, reason: guardrail.reason })
      return
    }

    // Clasificar intent con historial
    const classification = await detectIntent(text, history)
    console.log('🧠 Intent:', {
      intent: classification.intent,
      confidence: classification.confidence,
    })

    // Guardar mensaje entrante con intent ya conocido
    const savedInbound = await saveMessage({ jid, direction: 'inbound', text, intent: classification.intent, origin: 'client', contactName })

    getIO()?.to(jid).emit(
      EVENTS.NEW_MESSAGE,
      buildNewMessage({
        id: savedInbound?.id,
        conversationId: savedInbound?.conversationId,
        jid, direction: 'inbound',
        text, origin: 'client',
        intent: classification.intent,
      }),
    )
    getIO()?.emit(
      EVENTS.CONVERSATION_UPDATED,
      buildConversationUpdated({
        jid,
        lastMessage: text,
        intent: classification.intent,
        status: null,
      }),
    )

    switch (classification.intent) {
      case 'off_topic':
        console.log('💤 off_topic — ignorando:', jid)
        return

      case 'saludo': {
        console.log('👋 Saludo detectado:', jid)
        const greeting = await generateGreeting()
        if (!greeting) return
        await enqueueMessage(jid, greeting, 'bot', msg.key)
        const savedGreeting = await saveMessage({ jid, direction: 'outbound', text: greeting, intent: 'saludo', origin: 'bot' })
        await addToContext(jid, 'assistant', greeting)
        getIO()?.to(jid).emit(
          EVENTS.NEW_MESSAGE,
          buildNewMessage({
            id: savedGreeting?.id,
            conversationId: savedGreeting?.conversationId,
            jid, direction: 'outbound',
            text: greeting, origin: 'bot', intent: 'saludo',
          }),
        )
        getIO()?.emit(
          EVENTS.CONVERSATION_UPDATED,
          buildConversationUpdated({ jid, lastMessage: greeting, intent: 'saludo', status: null }),
        )
        return
      }

      case 'consulta': {
        console.log('❓ Consulta:', jid)
        const respuesta = await generateResponse(text, history)
        if (!respuesta) return
        await enqueueMessage(jid, respuesta, 'bot', msg.key)
        const savedResponse = await saveMessage({ jid, direction: 'outbound', text: respuesta, intent: 'consulta', origin: 'bot' })
        await addToContext(jid, 'assistant', respuesta)
        getIO()?.to(jid).emit(
          EVENTS.NEW_MESSAGE,
          buildNewMessage({
            id: savedResponse?.id,
            conversationId: savedResponse?.conversationId,
            jid, direction: 'outbound',
            text: respuesta, origin: 'bot', intent: 'consulta',
          }),
        )
        getIO()?.emit(
          EVENTS.CONVERSATION_UPDATED,
          buildConversationUpdated({ jid, lastMessage: respuesta, intent: 'consulta', status: null }),
        )
        return
      }

      case 'intencion': {
        console.log('🎯 INTENCIÓN DE COMPRA:', jid)
        const confirmacion = 'Perfecto, en un momento un asesor te contacta para coordinar. 😊'
        await enqueueMessage(jid, confirmacion, 'bot', msg.key)
        const savedConfirmacion = await saveMessage({ jid, direction: 'outbound', text: confirmacion, intent: 'intencion', origin: 'bot' })
        await addToContext(jid, 'assistant', confirmacion)
        await pauseConversation(jid)
        await updateConversationStatus(jid, 'human')

        getIO()?.to(jid).emit(
          EVENTS.NEW_MESSAGE,
          buildNewMessage({
            id: savedConfirmacion?.id,
            conversationId: savedConfirmacion?.conversationId,
            jid, direction: 'outbound',
            text: confirmacion, origin: 'bot', intent: 'intencion',
          }),
        )
        getIO()?.emit(
          EVENTS.CONVERSATION_STATUS_CHANGED,
          buildStatusChanged({ jid, status: 'human', updatedBy: 'bot' }),
        )
        getIO()?.emit(
          EVENTS.INTENT_DETECTED,
          {
            jid, text,
            confidence: classification.confidence,
            reason: classification.reason,
            timestamp: new Date().toISOString(),
          },
        )
        getIO()?.emit(
          EVENTS.CONVERSATION_UPDATED,
          buildConversationUpdated({ jid, lastMessage: confirmacion, intent: 'intencion', status: 'human' }),
        )
        return
      }
    }

  } catch (err) {
    console.error('❌ Pipeline error:', err.message)
  }
}
