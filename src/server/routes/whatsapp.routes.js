import * as whatsapp from '../controllers/whatsapp.controller.js'

export default async function whatsappRoutes(app) {
  app.get('/whatsapp/status', whatsapp.getStatus)
  // /logout es destructivo (corta la sesión de WhatsApp) — límite muy estricto.
  app.post('/whatsapp/logout', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, whatsapp.logout)
}
