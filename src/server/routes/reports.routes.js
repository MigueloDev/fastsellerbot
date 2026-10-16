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
          paymentState: {
            type: 'string',
            enum: ['PAGADA', 'ABONADA', 'CREDITO'],
          },
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
