import * as leads from '../controllers/leads.controller.js'

const LEAD_SOURCES = ['TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'OTRO']

const properties = {
  name: { type: 'string', minLength: 1 },
  phone: { type: ['string', 'null'] },
  source: { type: 'string', enum: LEAD_SOURCES },
  lastRemindedAt: { type: ['string', 'null'], format: 'date-time' },
}

export default async function leadsRoutes(app) {
  app.get('/leads', leads.list)

  app.post('/leads', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'source'],
        additionalProperties: false,
        properties,
      },
    },
  }, leads.create)

  app.patch('/leads/:id', {
    schema: {
      body: { type: 'object', additionalProperties: false, properties },
    },
  }, leads.patch)

  app.delete('/leads/:id', leads.remove)
}
