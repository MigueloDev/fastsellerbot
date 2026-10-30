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

const deliverySchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['RETIRO', 'DELIVERY', 'FORANEA'] },
    address: { type: ['string', 'null'], maxLength: 500 },
    reference: { type: ['string', 'null'], maxLength: 500 },
    lat: { type: ['number', 'null'], minimum: -90, maximum: 90 },
    lng: { type: ['number', 'null'], minimum: -180, maximum: 180 },
  },
}

const chargeSchema = {
  type: 'object',
  required: ['kind', 'amountUsd'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['DELIVERY', 'ENVIO', 'COMISION', 'OTRO'] },
    description: { type: ['string', 'null'], maxLength: 200 },
    amountUsd: { type: 'number', exclusiveMinimum: 0 },
    // true → suma al total que debe el cliente; false → gasto interno (resta ganancia)
    billedToCustomer: { type: 'boolean' },
  },
}

// Un PDF de 10 MiB en base64 pesa ~13.4 MiB; se le da margen a payments/evidence.
const FILE_BODY_LIMIT = 14 * 1024 * 1024

export default async function salesRoutes(app) {
  app.get('/sales', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDIENTE', 'PAGADA', 'ANULADA'] },
          delivery: { type: 'string', enum: ['POR_ENTREGAR', 'ENTREGADA'] },
          deliveryType: { type: 'string', enum: ['RETIRO', 'DELIVERY', 'FORANEA'] },
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
          // UUID generado por el cliente (app móvil offline); idempotencia.
          clientId: { type: ['string', 'null'], minLength: 1 },
          customerId: { type: 'string', minLength: 1 },
          priceRef: { type: 'string', enum: ['REF_USD', 'REF_BS'] },
          items: {
            type: 'array',
            minItems: 1,
            items: saleItemSchema,
          },
          note: { type: ['string', 'null'] },
          delivery: deliverySchema,
          charges: { type: 'array', maxItems: 20, items: chargeSchema },
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
          // Omitidos → se conservan la entrega y los costos actuales.
          delivery: deliverySchema,
          charges: { type: 'array', maxItems: 20, items: chargeSchema },
        },
      },
    },
  }, sales.update)

  app.patch('/sales/:id/delivery', {
    schema: { body: { ...deliverySchema, type: 'object', required: ['type'] } },
  }, sales.setDelivery)

  app.post('/sales/:id/charges', { schema: { body: chargeSchema } }, sales.addCharge)
  app.delete('/sales/:id/charges/:chargeId', sales.removeCharge)

  app.post('/sales/:id/payments', {
    // Base64 receipts can be multi-MB; Fastify default body limit is 1 MiB.
    bodyLimit: FILE_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['method', 'amount', 'accountId'],
        additionalProperties: false,
        properties: {
          clientId: { type: ['string', 'null'], minLength: 1 },
          method: { type: 'string', enum: PAYMENT_METHOD_KEYS },
          amount: { type: 'number', exclusiveMinimum: 0 },
          accountId: { type: 'string', minLength: 1 },
          note: { type: ['string', 'null'] },
          receiptBase64: { type: ['string', 'null'] },
          receiptContentType: { type: 'string', enum: ['image/webp', 'application/pdf'] },
          // Fila BCV histórica (GET /rates/history); sin ella → tasa live.
          rateId: { type: ['string', 'null'], minLength: 1 },
          // ISO; pago offline sincronizado tarde → usa la BCV vigente en ese momento.
          paidAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
  }, sales.pay)

  app.get('/payments/:id/receipt-url', sales.receiptUrl)

  app.put('/payments/:id/receipt', {
    bodyLimit: FILE_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['receiptBase64'],
        additionalProperties: false,
        properties: {
          receiptBase64: { type: 'string', minLength: 1 },
        },
      },
    },
  }, sales.putReceipt)

  app.delete('/payments/:id/receipt', sales.deleteReceipt)

  app.post('/sales/:id/evidence', {
    bodyLimit: FILE_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['fileBase64', 'contentType'],
        additionalProperties: false,
        properties: {
          fileBase64: { type: 'string', minLength: 1 },
          contentType: { type: 'string', enum: ['image/webp', 'application/pdf'] },
        },
      },
    },
  }, sales.uploadEvidence)

  app.get('/sales/:id/evidence-url', sales.evidenceUrl)

  app.post('/sales/:id/deliver', sales.deliver)
  app.post('/sales/:id/undeliver', sales.undeliver)

  app.post('/sales/:id/void', sales.void_)

  app.get('/receivables', sales.receivables)
}
