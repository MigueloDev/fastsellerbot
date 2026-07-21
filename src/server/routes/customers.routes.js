import * as customers from '../controllers/customers.controller.js'

export default async function customersRoutes(app) {
  app.get('/customers', customers.list)

  app.post('/customers', {
    schema: {
      body: {
        type: 'object',
        required: ['cedula', 'firstName', 'lastName'],
        additionalProperties: false,
        properties: {
          cedula: { type: 'string', minLength: 1 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          phone: { type: ['string', 'null'] },
          jid: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, customers.create)

  app.patch('/customers/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cedula: { type: 'string', minLength: 1 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          phone: { type: ['string', 'null'] },
          jid: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          active: { type: 'boolean' },
        },
      },
    },
  }, customers.patch)
}
