import * as rates from '../controllers/rates.controller.js'

export default async function ratesRoutes(app) {
  app.get('/rates', rates.get)
}
