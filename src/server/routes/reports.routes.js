import * as reports from '../controllers/reports.controller.js'

export default async function reportsRoutes(app) {
  app.get('/reports/sales', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          // CSV para selección múltiple (ej. "PAGADA,ABONADA"); getSalesReport
          // valida cada valor contra el enum y descarta los inválidos (csvIn).
          status: { type: 'string' },
          delivery: { type: 'string' },
          deliveryType: { type: 'string', enum: ['RETIRO', 'DELIVERY', 'FORANEA'] },
          customerId: { type: 'string' },
          paymentState: { type: 'string' },
          // CSV de PaymentMethod / ids de CashAccount (pagos de la venta).
          method: { type: 'string' },
          accountId: { type: 'string' },
        },
      },
    },
  }, reports.sales)

  app.get('/reports/payments', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          // CSV de PaymentMethod; los inválidos se descartan (csvIn).
          method: { type: 'string' },
        },
      },
    },
  }, reports.payments)

  app.get('/reports/kardex', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: { type: 'string', minLength: 1 },
          variantId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, reports.kardex)

  app.get('/reports/movements', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: { type: 'string', minLength: 1 },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, reports.movements)

  app.get('/reports/fx/csv', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          mode: { type: 'string', enum: ['detail', 'summary'], default: 'detail' },
        },
      },
    },
  }, reports.fxCsv)

  app.get('/reports/fx', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, reports.fx)
}
