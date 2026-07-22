import { PAYMENT_METHOD_KEYS } from '../../sales/paymentMethods.js'
import * as sales from '../controllers/sales.controller.js'

const saleItemSchema = {
  type: 'object',
  required: ['productId', 'quantity'],
  additionalProperties: false,
  properties: {
    productId: { type: 'string', minLength: 1 },
    variantId: { type: ['string', 'null'] },
    quantity: { type: 'integer', minimum: 1 },
    // Opcional: override manual del precio unitario (USD según priceRef).
    // Sin él, el backend elige el nivel ProductPrice.minQty por qty agregada.
    unitPriceUsd: { type: 'number', exclusiveMinimum: 0 },
  },
}

export default async function salesRoutes(app) {
  app.get('/sales', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDIENTE', 'PAGADA', 'ANULADA'] },
          delivery: { type: 'string', enum: ['POR_ENTREGAR', 'ENTREGADA'] },
          customerId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  }, sales.list)
  app.get('/sales/:id', sales.get)

  app.post('/sales', {
    schema: {
      body: {
        type: 'object',
        required: ['customerId', 'priceRef', 'items'],
        additionalProperties: false,
        properties: {
          customerId: { type: 'string', minLength: 1 },
          priceRef: { type: 'string', enum: ['REF_USD', 'REF_BS'] },
          items: {
            type: 'array',
            minItems: 1,
            items: saleItemSchema,
          },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, sales.create)

  app.patch('/sales/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['customerId', 'priceRef', 'items'],
        additionalProperties: false,
        properties: {
          customerId: { type: 'string', minLength: 1 },
          priceRef: { type: 'string', enum: ['REF_USD', 'REF_BS'] },
          items: {
            type: 'array',
            minItems: 1,
            items: saleItemSchema,
          },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, sales.update)

  app.post('/sales/:id/payments', {
    schema: {
      body: {
        type: 'object',
        required: ['method', 'amount'],
        additionalProperties: false,
        properties: {
          method: { type: 'string', enum: PAYMENT_METHOD_KEYS },
          amount: { type: 'number', exclusiveMinimum: 0 },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, sales.pay)

  app.post('/sales/:id/deliver', sales.deliver)
  app.post('/sales/:id/undeliver', sales.undeliver)

  app.post('/sales/:id/void', sales.void_)

  app.get('/receivables', sales.receivables)
}
