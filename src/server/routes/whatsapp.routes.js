import * as whatsapp from '../controllers/whatsapp.controller.js'

export default async function whatsappRoutes(app) {
  app.get('/whatsapp/status', whatsapp.getStatus)
  app.post('/whatsapp/logout', whatsapp.logout)
}
