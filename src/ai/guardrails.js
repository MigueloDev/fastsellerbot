const INJECTION_PATTERNS = [
  /\[system\]/i,
  /\[assistant\]/i,
  /<\|.*\|>/,
  /###\s*instruction/i,
  /system\s*prompt/i,
]

const JAILBREAK_PATTERNS = [
  /ignora\s*(tus\s*)?(instrucciones|sistema)/i,
  /olvida\s*(tus\s*)?(instrucciones|sistema)/i,
  /act[uú]a\s*como/i,
  /jailbreak/i,
  /bypass/i,
  /pretend\s*you/i,
  /ignore\s*(all\s*)?(previous\s*)?instructions/i,
]

export function sanitizeInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { safe: false, reason: 'empty' }
  }

  const truncated = text.slice(0, 500)

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(truncated)) {
      return { safe: false, reason: 'prompt_injection' }
    }
  }

  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(truncated)) {
      return { safe: false, reason: 'jailbreak_attempt' }
    }
  }

  const sanitized = truncated.replace(/[`"\\]/g, ' ')

  return { safe: true, text: sanitized }
}
