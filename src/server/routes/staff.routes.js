import * as staff from '../controllers/staff.controller.js'

export default async function staffRoutes(app) {
  app.get('/me', staff.me)

  app.get('/staff', staff.list)

  app.patch('/staff/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        additionalProperties: false,
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'VENDEDOR'] },
        },
      },
    },
  }, staff.patchRole)
}
