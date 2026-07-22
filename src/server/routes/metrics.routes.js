import * as metrics from '../controllers/metrics.controller.js'

export default async function metricsRoutes(app) {
  app.get('/metrics/summary', {
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
  }, metrics.summary)
}
