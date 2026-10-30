import { listProducts } from '../../db/products.js'
import { listStockLevels } from '../../db/stock.js'
import { listCustomers } from '../../db/customers.js'
import { listCashAccounts } from '../../db/cashAccounts.js'
import { getRates } from '../../rates/getRates.js'
import { publicCashAccount, redactProductForSeller } from '../roles.js'

function isSeller(request) {
  return request.user?.role === 'VENDEDOR'
}

function mapStock(level) {
  return {
    productId: level.productId,
    variantId: level.variantId,
    quantity: level.quantity,
    committed: level.committed,
    available: level.available,
  }
}

function mapCustomer(c) {
  return {
    id: c.id,
    clientId: c.clientId,
    cedula: c.cedula,
    firstName: c.firstName,
    lastName: c.lastName,
    name: c.name,
    phone: c.phone,
  }
}

/**
 * Arranque offline de la app móvil: catálogo + stock + clientes + tasas +
 * cuentas de caja en una sola respuesta, sin N+1 (todo en paralelo,
 * reutilizando las queries de `src/db/*` que ya alimentan el dashboard).
 */
export async function bootstrap(request) {
  const [products, stockLevels, customers, rates, cashAccounts] = await Promise.all([
    listProducts({ includeInactive: false }),
    listStockLevels(),
    listCustomers({ includeInactive: false, limit: null }),
    getRates(),
    listCashAccounts(),
  ])

  return {
    serverTime: new Date().toISOString(),
    me: {
      userId: request.user.userId,
      staffId: request.user.staffId,
      name: request.user.name,
      role: request.user.role,
    },
    products: isSeller(request) ? products.map(redactProductForSeller) : products,
    stock: stockLevels.map(mapStock),
    customers: customers.map(mapCustomer),
    rates,
    cashAccounts: cashAccounts.filter((a) => a.active).map(publicCashAccount),
  }
}
