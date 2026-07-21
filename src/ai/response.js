import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { buildResponsePrompt, buildGreetingPrompt } from './prompts.js'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function generateResponse(userMessage, history = []) {
  try {
    const { text } = await generateText({
      model: groq('llama-3.1-8b-instant'),
      system: buildResponsePrompt(history),
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

export async function generateGreeting() {
  try {
    const { text } = await generateText({
      model: groq('llama-3.1-8b-instant'),
      system: buildGreetingPrompt(),
      prompt: 'El cliente acaba de saludar.',
      temperature: 0.9,
      maxTokens: 60,
    })

    return text.trim()
  } catch (err) {
    console.error('❌ Groq error en generateGreeting:', err.message)
    return '¡Hola! ¿En qué te puedo ayudar?'
  }
}
