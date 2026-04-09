import { generateText, Output } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { z } from 'zod'
import { sanitizeInput } from './guardrails.js'
import { buildClassifierPrompt } from './prompts.js'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

const intentSchema = z.object({
  intent: z.enum(['off_topic', 'consulta', 'intencion']),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
})

export async function detectIntent(text) {
  console.log('process.env.GROQ_API_KEY', process.env.GROQ_API_KEY)
  console.log('groq', groq)
  const guardrail = sanitizeInput(text)

  if (!guardrail.safe) {
    return { intent: 'off_topic', confidence: 0, reason: guardrail.reason, blocked: true }
  }

  try {
    const { output } = await generateText({
      model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
      output: Output.object({ schema: intentSchema }),
      system: buildClassifierPrompt(),
      prompt: guardrail.text,
      temperature: 0.1,
    })

    return { ...output, blocked: false }
  } catch (err) {
    console.error('❌ Groq error en detectIntent:', err.message)
    return { intent: 'off_topic', confidence: 0, reason: 'ai_error', blocked: false }
  }
}
