/**
 * Background music (BGM) helper.
 *
 * Notes:
 * - Most browsers block autoplay with sound until the user interacts with the page.
 *   We therefore lazy-start on the first pointer/key interaction.
 * - Preference is stored in localStorage.
 */

const KEY = 'casino_bgm_on_v1'

let audio: HTMLAudioElement | null = null
let primed = false

function getSrc(): string {
  // Put your music file here: /public/audio/bgm.mp3
  // In production with a non-root base, BASE_URL ensures correct path.
  const base = (import.meta as any)?.env?.BASE_URL ?? '/'
  return `${base}audio/bgm.mp3`
}

export function isBgmOn(): boolean {
  // Default: ON
  return localStorage.getItem(KEY) !== '0'
}

export function setBgmOn(v: boolean): void {
  localStorage.setItem(KEY, v ? '1' : '0')
  if (!v) stopBgm()
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio(getSrc())
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0.15
  return audio
}

export function setBgmVolume(v: number): void {
  const a = ensureAudio()
  a.volume = Math.max(0, Math.min(1, v))
}

export async function startBgm(): Promise<void> {
  if (!isBgmOn()) return
  const a = ensureAudio()
  try {
    await a.play()
  } catch {
    // autoplay likely blocked until user gesture
  }
}

export function stopBgm(): void {
  if (!audio) return
  try {
    audio.pause()
  } catch {
    // ignore
  }
}

/**
 * Call once on app mount.
 * It will attempt to start immediately, then re-attempt after the first user gesture.
 */
export function initBgm(): void {
  // Attempt right away (works if the browser allows it)
  void startBgm()

  if (primed) return
  primed = true

  const kick = async () => {
    window.removeEventListener('pointerdown', kick)
    window.removeEventListener('keydown', kick)
    await startBgm()
  }

  // First user gesture: try again.
  window.addEventListener('pointerdown', kick, { once: true })
  window.addEventListener('keydown', kick, { once: true })
}

export function toggleBgm(): boolean {
  const next = !isBgmOn()
  setBgmOn(next)
  if (next) void startBgm()
  return next
}
