import {
  listCustomers,
  createCustomer,
  updateCustomer,
  CustomerError,
} from '../../db/customers.js'

function handleError(err, reply) {
  if (err instanceof CustomerError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  if (err.code === 'P2002') {
    const target = err.meta?.target
    const field = Array.isArray(target) && target.includes('cedula')
      ? 'cedula'
      : 'jid'
    reply.status(422).send({ error: `${field} ya existe` })
    return true
  }
  return false
}

export async function list(request, reply) {
  try {
    const q = request.query?.q
    const includeInactive =
      request.query?.includeInactive === 'true' || request.query?.includeInactive === true
    return await listCustomers({ q, includeInactive })
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function create(request, reply) {
  try {
    const customer = await createCustomer(request.body)
    reply.status(201).send(customer)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function patch(request, reply) {
  try {
    const customer = await updateCustomer(request.params.id, request.body)
    return customer
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}
