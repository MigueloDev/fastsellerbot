import * as conversations from '../controllers/conversations.controller.js'

export default async function conversationsRoutes(app) {
  app.get('/conversations', conversations.list)
  app.get('/conversations/:jid/messages', conversations.messages)
  app.patch('/conversations/:jid/status', conversations.patchStatus)
  app.post('/send', conversations.send)
}
