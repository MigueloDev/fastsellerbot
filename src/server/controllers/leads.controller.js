import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  LeadError,
} from '../../db/leads.js'

function handleError(err, reply) {
  if (err instanceof LeadError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function list(request) {
  return listLeads({ q: request.query?.q })
}

export async function create(request, reply) {
  try {
    reply.status(201).send(await createLead(request.body))
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function patch(request, reply) {
  try {
    return await updateLead(request.params.id, request.body)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function remove(request, reply) {
  try {
    return await deleteLead(request.params.id)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}
