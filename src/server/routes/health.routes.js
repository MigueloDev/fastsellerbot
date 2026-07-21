import { createHealthHandler } from '../controllers/health.controller.js'

export default async function healthRoutes(app, opts) {
  app.get('/health', createHealthHandler(opts.sockBaileys))
}
