import * as stock from '../controllers/stock.controller.js'

const movementItemSchema = {
  type: 'object',
  required: ['productId', 'type'],
  additionalProperties: false,
  properties: {
    productId: { type: 'string', minLength: 1 },
    variantId: { type: ['string', 'null'] },
    type: { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'] },
    quantity: { type: 'integer', minimum: 1 },
    delta: { type: 'integer' },
    unitCost: { type: ['number', 'null'], minimum: 0 },
    note: { type: ['string', 'null'] },
  },
}

const movementsBodySchema = {
  type: 'object',
  required: ['movements'],
  additionalProperties: false,
  properties: {
    movements: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: movementItemSchema,
    },
  },
}

export default async function stockRoutes(app) {
  app.get('/stock', stock.list)
  app.get('/products/:id/stock', stock.productStock)

  app.post('/stock/movements', {
    schema: { body: movementsBodySchema },
  }, stock.createMovementBatch)

  app.get('/stock/movements', stock.listMovementHistory)
}
