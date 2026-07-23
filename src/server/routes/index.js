import healthRoutes from './health.routes.js'
import conversationsRoutes from './conversations.routes.js'
import ratesRoutes from './rates.routes.js'
import productsRoutes from './products.routes.js'
import stockRoutes from './stock.routes.js'
import customersRoutes from './customers.routes.js'
import salesRoutes from './sales.routes.js'
import metricsRoutes from './metrics.routes.js'
import reportsRoutes from './reports.routes.js'
import whatsappRoutes from './whatsapp.routes.js'
import currencyPurchasesRoutes from './currencyPurchases.routes.js'

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
  await app.register(metricsRoutes)
  await app.register(reportsRoutes)
  await app.register(whatsappRoutes)
  await app.register(currencyPurchasesRoutes)
}
