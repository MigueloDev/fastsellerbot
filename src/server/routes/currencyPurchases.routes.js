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
    schema: {
      body: {
        type: 'object',
        required: ['saleId', 'binanceRate', 'usdtReceived'],
        additionalProperties: false,
        properties: {
          saleId: { type: 'string', minLength: 1 },
          binanceRate: { type: 'number', exclusiveMinimum: 0 },
          usdtReceived: { type: 'number', exclusiveMinimum: 0 },
          note: { type: ['string', 'null'] },
        },
      },
    },
  }, currencyPurchases.create)
}
