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
          status: { type: 'string', enum: ['PENDIENTE', 'PAGADA', 'ANULADA'] },
          delivery: { type: 'string', enum: ['POR_ENTREGAR', 'ENTREGADA'] },
          customerId: { type: 'string' },
        },
      },
    },
  }, reports.sales)

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
}
