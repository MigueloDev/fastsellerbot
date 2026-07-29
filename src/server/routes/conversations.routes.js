import * as conversations from '../controllers/conversations.controller.js'

export default async function conversationsRoutes(app) {
  app.get('/conversations', conversations.list)
  app.get('/conversations/:jid/messages', conversations.messages)
  app.patch('/conversations/:jid/status', conversations.patchStatus)
  // /send envía a WhatsApp — límite más estricto que el global.
  app.post('/send', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, conversations.send)
}
