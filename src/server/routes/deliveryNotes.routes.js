import * as deliveryNotes from '../controllers/deliveryNotes.controller.js'

const itemSchema = {
  type: 'object',
  required: ['productId', 'quantity'],
  additionalProperties: false,
  properties: {
    productId: { type: 'string', minLength: 1 },
    variantId: { type: ['string', 'null'] },
    quantity: { type: 'integer', minimum: 1 },
    unitPriceUsd: { type: 'number', exclusiveMinimum: 0 },
  },
}

export default async function deliveryNotesRoutes(app) {
  app.get('/delivery-notes', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ACTIVA', 'ANULADA'] },
          customerId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  }, deliveryNotes.list)

  app.get('/delivery-notes/:id', deliveryNotes.get)

  app.post('/delivery-notes', {
    schema: {
      body: {
        type: 'object',
        required: ['customerId', 'items'],
        additionalProperties: false,
        properties: {
          customerId: { type: 'string', minLength: 1 },
          showValue: { type: 'boolean' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: itemSchema,
          },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, deliveryNotes.create)

  app.post('/delivery-notes/:id/void', deliveryNotes.void_)
}
