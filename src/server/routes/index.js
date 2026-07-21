import healthRoutes from './health.routes.js'
import conversationsRoutes from './conversations.routes.js'
import ratesRoutes from './rates.routes.js'
import productsRoutes from './products.routes.js'
import stockRoutes from './stock.routes.js'
import customersRoutes from './customers.routes.js'
import salesRoutes from './sales.routes.js'

/**
 * Punto único de montaje. Todos los HTTP viven en plugins → controllers.
 */
export async function registerRoutes(app, sockBaileys) {
  await app.register(healthRoutes, { sockBaileys })
  await app.register(conversationsRoutes)
  await app.register(ratesRoutes)
  await app.register(productsRoutes)
  await app.register(stockRoutes)
  await app.register(customersRoutes)
  await app.register(salesRoutes)
}
