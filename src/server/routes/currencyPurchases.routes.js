import * as currencyPurchases from '../controllers/currencyPurchases.controller.js'

export default async function currencyPurchasesRoutes(app) {
  app.get('/currency-purchases', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  }, currencyPurchases.list)

  app.get('/currency-purchases/eligible-sales', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
        },
      },
    },
  }, currencyPurchases.eligible)

  app.post('/currency-purchases', {
    // Base64 receipts can be multi-MB; Fastify default body limit is 1 MiB.
    bodyLimit: 7 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['binanceRate', 'usdtReceived', 'fromAccountId', 'toAccountId'],
        additionalProperties: false,
        properties: {
          saleId: { type: 'string', minLength: 1 },
          saleIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          binanceRate: { type: 'number', exclusiveMinimum: 0 },
          usdtReceived: { type: 'number', exclusiveMinimum: 0 },
          note: { type: ['string', 'null'] },
          receiptBase64: { type: ['string', 'null'] },
          fromAccountId: { type: 'string', minLength: 1 },
          toAccountId: { type: 'string', minLength: 1 },
        },
      },
    },
  }, currencyPurchases.create)

  app.get('/currency-purchases/:id/receipt-url', currencyPurchases.receiptUrl)
}
