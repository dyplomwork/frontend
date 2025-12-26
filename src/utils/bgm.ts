/**
 * Background music (BGM) helper.
 *
 * Features:
 * - Autoplay-safe: starts after first user gesture if blocked.
 * - Stores enabled + volume in localStorage.
 * - Smart behavior: pause when tab hidden, resume on return (if it was playing).
 */

const KEY_ON = 'casino_bgm_on_v1'
const KEY_VOL = 'casino_bgm_vol_v1'

let audio: HTMLAudioElement | null = null
let primed = false
let pausedByVisibility = false

function clamp(v: number, min: number, max: number) {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min
}

function getSrc(): string {
  // Put your music file here: /public/audio/bgm.mp3
  // In production with a non-root base, BASE_URL ensures correct path.
  const base = (import.meta as any)?.env?.BASE_URL ?? '/'
  return `${base}audio/bgm.mp3`
}

export function isBgmOn(): boolean {
  // Default: ON
  return localStorage.getItem(KEY_ON) !== '0'
}

export function setBgmOn(v: boolean): void {
  localStorage.setItem(KEY_ON, v ? '1' : '0')
  if (!v) {
    pausedByVisibility = false
    stopBgm()
  } else {
    void startBgm()
  }
}

export function getBgmVolume(): number {
  // Default 0.15
  return clamp(parseFloat(localStorage.getItem(KEY_VOL) ?? '0.15'), 0, 1)
}

export function setBgmVolume(v: number): void {
  const vol = clamp(v, 0, 1)
  localStorage.setItem(KEY_VOL, String(vol))
  const a = ensureAudio()
  a.volume = vol
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio(getSrc())
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = getBgmVolume()
  return audio
}

export async function startBgm(): Promise<void> {
  if (!isBgmOn()) return
  if (document.visibilityState !== 'visible') return

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
 * It will attempt to start immediately, then re-attempt after the first user gesture,
 * and will pause/resume on tab visibility changes.
 */
export function initBgm(): void {
  // Attempt right away (works if the browser allows it)
  void startBgm()

  // Smart visibility behavior (bind once)
  if (!primed) {
    primed = true

    // First user gesture: try again.
    const kick = async () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      await startBgm()
    }

    window.addEventListener('pointerdown', kick, { once: true })
    window.addEventListener('keydown', kick, { once: true })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // pause only if currently playing
        if (audio && !audio.paused) {
          pausedByVisibility = true
          stopBgm()
        }
      } else {
        // resume only if it was paused by visibility and music is enabled
        if (pausedByVisibility && isBgmOn()) {
          pausedByVisibility = false
          void startBgm()
        }
      }
    })
  }
}

export function toggleBgm(): boolean {
  const next = !isBgmOn()
  setBgmOn(next)
  return next
}
