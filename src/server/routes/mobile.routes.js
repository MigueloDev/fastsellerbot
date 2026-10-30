import * as mobile from '../controllers/mobile.controller.js'

export default async function mobileRoutes(app) {
  app.get('/mobile/bootstrap', mobile.bootstrap)
}
