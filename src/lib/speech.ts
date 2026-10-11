// Hands-free mode: the phone's own text-to-speech (works offline on Android
// and iOS) reads results aloud so your eyes can stay on the bird.

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
  // Prefer on-device voices so it keeps working without signal.
  return voices.find((v) => v.localService && v.default) ?? voices.find((v) => v.localService) ?? voices[0]
}

let last = { text: '', at: 0 }

export function speak(text: string) {
  if (!canSpeak) return
  // Never repeat the same line back-to-back (e.g. a result re-rendering).
  if (text === last.text && Date.now() - last.at < 4000) return
  last = { text, at: Date.now() }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  const voice = pickVoice()
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  }
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel()
}

/** A short buzz so you know it's done without looking. */
export function buzz(pattern: number | number[] = 120) {
  navigator.vibrate?.(pattern)
}

export function sayPercent(score: number) {
  const p = Math.round(score * 100)
  return p >= 85 ? 'Very likely.' : p >= 60 ? `About ${p} percent sure.` : `Only ${p} percent sure, so take a closer look.`
}
