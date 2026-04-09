import { getConversations, getMessages, updateConversationStatus } from '../db/conversations.js'
import { enqueueMessage } from '../queue/producer.js'

export async function registerRoutes(app, sockBaileys) {
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      bot: sockBaileys?.user ? 'connected' : 'disconnected',
    }
  })

  app.get('/conversations', async (request, reply) => {
    try {
      const data = await getConversations()
      return data
    } catch (err) {
      reply.status(500).send({ error: err.message })
    }
  })

  app.get('/conversations/:jid/messages', async (request, reply) => {
    try {
      const jid = decodeURIComponent(request.params.jid)
      const messages = await getMessages(jid)
      return messages
    } catch (err) {
      reply.status(500).send({ error: err.message })
    }
  })

  app.patch('/conversations/:jid/status', async (request, reply) => {
    try {
      const jid = decodeURIComponent(request.params.jid)
      await updateConversationStatus(jid, request.body.status)
      return { ok: true }
    } catch (err) {
      reply.status(500).send({ error: err.message })
    }
  })

  app.post('/send', async (request, reply) => {
    try {
      const { jid, text } = request.body
      if (!jid || !text) {
        reply.status(400).send({ error: 'jid y text son requeridos' })
        return
      }
      await saveMessage({ jid, direction: 'outbound', text, intent: '', origin: 'human' })
      await enqueueMessage(jid, text, 'manual')
      return { ok: true, queued: true }
    } catch (err) {
      reply.status(500).send({ error: err.message })
    }
  })
}
