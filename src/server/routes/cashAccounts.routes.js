import * as cashAccounts from '../controllers/cashAccounts.controller.js'

export default async function cashAccountsRoutes(app) {
  app.get('/cash-accounts', cashAccounts.list)

  app.post('/cash-accounts', {
    schema: {
      body: {
        type: 'object',
        required: ['alias', 'institution', 'holder', 'currency'],
        additionalProperties: false,
        properties: {
          alias: { type: 'string', minLength: 1 },
          institution: { type: 'string', minLength: 1 },
          holder: { type: 'string', minLength: 1 },
          currency: { type: 'string', enum: ['BS', 'USD'] },
        },
      },
    },
  }, cashAccounts.create)

  app.get('/cash-accounts/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  }, cashAccounts.get)

  app.patch('/cash-accounts/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          alias: { type: 'string', minLength: 1 },
          institution: { type: 'string', minLength: 1 },
          holder: { type: 'string', minLength: 1 },
          active: { type: 'boolean' },
          currency: { type: 'string', enum: ['BS', 'USD'] },
        },
      },
    },
  }, cashAccounts.patch)

  app.post('/cash-accounts/:id/movements', {
    schema: {
      body: {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'] },
          reason: { type: 'string', enum: ['MANUAL', 'GASTO', 'PRESTAMO'] },
          amount: { type: 'number' },
          delta: { type: 'number' },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, cashAccounts.createMovement)
}
