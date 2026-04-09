import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { buildResponsePrompt } from './prompts.js'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function generateResponse(userMessage) {
  try {
    const { text } = await generateText({
      model: groq('llama-3.1-8b-instant'),
      system: buildResponsePrompt(),
      prompt: userMessage,
      temperature: 0.7,
      maxTokens: 250,
    })

    return text.trim()
  } catch (err) {
    console.error('❌ Groq error en generateResponse:', err.message)
    return null
  }
}
