import { z } from 'zod'
import { sanitizeInput } from './guardrails.js'
import { buildLeadScorePrompt } from './prompts.js'

// DeepSeek es compatible con la API de OpenAI: fetch directo, sin SDK extra.
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
const MAX_MESSAGES = 30

const leadSchema = z.object({
  score: z.number().min(0).max(100),
  stage: z.enum(['caliente', 'tibio', 'frio', 'descartado']),
  reason: z.string(),
  draft: z.string(),
})

/** Puntúa un lead silencioso y redacta el mensaje de reactivación. Lanza si DeepSeek falla. */
export async function scoreLead({ messages, daysSilent, lastFrom }) {
  const safe = messages.slice(-MAX_MESSAGES).map((m) => {
    if (m.fromMe) return m
    const guard = sanitizeInput(m.text)
    return { ...m, text: guard.safe ? guard.text : '[mensaje omitido]' }
  })

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildLeadScorePrompt({ messages: safe, daysSilent, lastFrom }) },
        { role: 'user', content: 'Analiza la conversación y responde solo con el JSON.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const body = await res.json()
  return leadSchema.parse(JSON.parse(body.choices[0].message.content))
}
