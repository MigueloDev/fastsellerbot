import {
  createDeliveryNote,
  voidDeliveryNote,
  findDeliveryNote,
  listDeliveryNotes,
  DeliveryNoteError,
} from '../../db/deliveryNotes.js'
import { StockError } from '../../db/stock.js'

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (err instanceof DeliveryNoteError || err instanceof StockError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function list(request, reply) {
  try {
    const { status, customerId, from, to, limit, offset } = request.query ?? {}
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const safeOffset = Math.max(Number(offset) || 0, 0)
    return await listDeliveryNotes({
      status,
      customerId,
      from,
      to,
      limit: safeLimit,
      offset: safeOffset,
    })
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function get(request, reply) {
  try {
    const note = await findDeliveryNote(request.params.id)
    if (!note) {
      reply.status(404).send({ error: 'Nota de entrega no encontrada' })
      return
    }
    return note
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function create(request, reply) {
  try {
    const body = request.body
    const note = await createDeliveryNote({
      customerId: body.customerId,
      showValue: body.showValue !== false,
      items: body.items,
      note: body.note,
      agentName: agentNameOf(request),
    })
    reply.status(201).send(note)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function void_(request, reply) {
  try {
    const note = await voidDeliveryNote(request.params.id, {
      agentName: agentNameOf(request),
    })
    return note
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}
