import { prisma } from './client.js'

export async function upsertConversation(jid, pushName) {
  return prisma.conversation.upsert({
    where: { jid },
    update: { lastMessageAt: new Date(), ...(pushName && { contactName: pushName })},
    create: { jid, lastMessageAt: new Date(), contactName: pushName },
  })
}

export async function saveMessage({
  jid, direction, text, intent, origin, agentName, contactName
}) {
  try {
    const conversation = await upsertConversation(jid, contactName)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction,
        text,
        intent: intent ?? null,
        origin: origin ?? null,
        agentName: agentName ?? null,
      },
    })
    console.log('💾 Mensaje guardado:', { jid, direction, origin })
    return message
  } catch (err) {
    console.error('❌ Error guardando mensaje:', err.message)
    return null  // nunca relanzar — no tumbar el pipeline
  }
}

const messageKey = (m) => `${m.createdAt.getTime()}|${m.direction}|${m.text}`

/**
 * Importa mensajes de WhatsApp con su fecha real (historial o en vivo) y enlaza Contact.
 * messages: [{ fromMe, text, ts (segundos), agentName? }]
 * ponytail: idempotente por (createdAt, direction, text); si choca, agregar waMessageId @unique.
 */
export async function importChat({ jid, name, messages }) {
  if (!messages.length) return 0

  const contact = await prisma.contact.upsert({
    where: { jid },
    update: { ...(name && { pushName: name }) },
    create: { jid, pushName: name ?? null },
  })

  const newest = new Date(Math.max(...messages.map((m) => m.ts)) * 1000)
  const prev = await prisma.conversation.findUnique({ where: { jid } })
  const lastMessageAt = prev?.lastMessageAt > newest ? prev.lastMessageAt : newest

  const conversation = await prisma.conversation.upsert({
    where: { jid },
    update: { lastMessageAt, contactId: contact.id, ...(name && { contactName: name }) },
    create: { jid, lastMessageAt, contactId: contact.id, contactName: name ?? null },
  })

  const existing = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    select: { createdAt: true, direction: true, text: true },
  })
  const seen = new Set(existing.map(messageKey))

  const data = []
  for (const m of messages) {
    const row = {
      conversationId: conversation.id,
      direction: m.fromMe ? 'outbound' : 'inbound',
      origin: m.fromMe ? 'manual' : 'client',
      agentName: m.agentName ?? null,
      text: m.text,
      createdAt: new Date(m.ts * 1000),
    }
    const key = messageKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    data.push(row)
  }

  if (data.length) await prisma.message.createMany({ data })
  return data.length
}

export async function getConversations() {
  return prisma.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,  // solo el último mensaje para el preview
      },
    },
  })
}

export async function getMessages(jid, limit = 50) {
  const conversation = await prisma.conversation.findUnique({
    where: { jid },
  })
  if (!conversation) return []

  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

export async function updateConversationStatus(jid, status) {
  await prisma.conversation.update({
    where: { jid },
    data: { status },
  })
  console.log('📝 Status actualizado:', { jid, status })
}
