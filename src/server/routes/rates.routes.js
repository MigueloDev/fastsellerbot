import * as rates from '../controllers/rates.controller.js'

export default async function ratesRoutes(app) {
  app.get('/rates', rates.get)
  app.get('/rates/history', rates.history)
  // Solo ADMIN (no está en roles.js SELLER_EXACT). Sin `rate` = refrescar desde upstream.
  app.post('/rates', {
    schema: {
      body: {
        type: 'object',
        required: ['source'],
        additionalProperties: false,
        properties: {
          source: { type: 'string', enum: ['BCV', 'BINANCE'] },
          rate: { type: 'number', exclusiveMinimum: 0 },
        },
      },
    },
  }, rates.update)
}
