export function readDelay() {
  return 800 + Math.random() * 1200 // 800–2000ms
}

export function typingDelay(text) {
  const words = text.split(' ').length
  const ms = (words / 28) * 60 * 1000
  const variation = ms * (0.8 + Math.random() * 0.4)
  return Math.min(8000, Math.max(1500, variation))
}

export function totalDelay(text) {
  return readDelay() + typingDelay(text)
}
