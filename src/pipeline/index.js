import { detectIntent } from '../ai/intent.js'
import { generateResponse } from '../ai/response.js'
import { enqueueMessage } from '../queue/producer.js'
import { saveMessage, updateConversationStatus } from '../db/conversations.js'
import { getIO } from '../server/fastify.js'

export async function processMessage(sock, msg) {
  try {
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      null

    if (!text) return

    const jid = msg.key.remoteJid

    console.log('🔍 Procesando:', { jid, text })

    // Persistir mensaje entrante
    await saveMessage({ jid, direction: 'inbound', text, intent: null, origin: 'client' })
    getIO()?.to(jid).emit('new_message', {
      jid, direction: 'inbound', text, origin: 'client', intent: null,
      createdAt: new Date().toISOString(),
    })

    const classification = await detectIntent(text)

    if (classification.blocked) {
      console.log('🛡️  Guardrails:', { jid, reason: classification.reason })
      return
    }

    console.log('🧠 Intent:', {
      intent: classification.intent,
      confidence: classification.confidence,
      reason: classification.reason,
    })

    switch (classification.intent) {
      case 'off_topic':
        console.log('💤 Ignorando:', jid)
        return

      case 'consulta':
        console.log('❓ Consulta — generando respuesta para:', jid)
        const respuesta = await generateResponse(text)
        if (!respuesta) {
          console.log('⚠️  Sin respuesta de IA, ignorando')
          return
        }
        await enqueueMessage(jid, respuesta, 'bot')
        // Persistir respuesta del bot
        await saveMessage({ jid, direction: 'outbound', text: respuesta, intent: 'consulta', origin: 'bot' })
        getIO()?.to(jid).emit('new_message', {
          jid, direction: 'outbound', text: respuesta, origin: 'bot', intent: 'consulta',
          createdAt: new Date().toISOString(),
        })
        getIO()?.emit('conversation_updated', {
          jid, intent: 'consulta', lastMessage: respuesta,
          lastMessageAt: new Date().toISOString(),
        })
        return

      case 'intencion':
        console.log('🎯 INTENCIÓN DE COMPRA:', {
          jid,
          confidence: classification.confidence,
        })
        const confirmacion = 'Hola, recibimos tu mensaje. En breve uno de nuestros asesores te contactará para atenderte. 😊'
        await enqueueMessage(jid, confirmacion, 'bot')
        // Persistir confirmación
        await saveMessage({ jid, direction: 'outbound', text: confirmacion, intent: 'intencion', origin: 'bot' })
        // Cambiar status de la conversación a 'human'
        await updateConversationStatus(jid, 'human')
        getIO()?.to(jid).emit('new_message', {
          jid, direction: 'outbound', text: confirmacion, origin: 'bot', intent: 'intencion',
          createdAt: new Date().toISOString(),
        })
        getIO()?.emit('intent_detected', {
          jid, text,
          confidence: classification.confidence,
          reason: classification.reason,
          timestamp: new Date().toISOString(),
        })
        getIO()?.emit('conversation_updated', {
          jid, intent: 'intencion', lastMessageAt: new Date().toISOString(),
        })
        return
    }
  } catch (err) {
    console.error('❌ Pipeline error:', err.message)
  }
}
