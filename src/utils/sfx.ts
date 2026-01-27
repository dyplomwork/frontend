const KEY = 'casino_sfx_on_v1'

let ctx: AudioContext | null = null
let master: GainNode | null = null

let fileCache: Map<string, HTMLAudioElement> | null = null
let plinkoBounceUrls: string[] | null = null

export function isSfxOn(){
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true
  return localStorage.getItem(KEY) !== '0'
}
export function setSfxOn(v: boolean){
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, v ? '1' : '0')
}

function ensure(){
  if(ctx) return
  const AC = (window.AudioContext || (window as any).webkitAudioContext)
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.12
  master.connect(ctx.destination)
}

function ensureFiles(){
  if(fileCache) return
  fileCache = new Map()
  plinkoBounceUrls = [
    '/sfx/plinko_bounce_2_var1.wav',
    '/sfx/plinko_bounce_2_var2.wav',
    '/sfx/plinko_bounce_2_var3.wav',
    '/sfx/plinko_bounce_2_var4.wav',
  ]
}

function playFile(url: string, gain = 0.8){
  if(!isSfxOn()) return
  if (typeof Audio === 'undefined') return
  ensureFiles()
  if(!fileCache) return
  let base = fileCache.get(url)
  if(!base){
    base = new Audio(url)
    base.preload = 'auto'
    base.volume = gain
    fileCache.set(url, base)
  }
  const node = base.cloneNode(true) as HTMLAudioElement
  node.volume = gain
  try {
    node.currentTime = 0
  } catch {}
  void node.play().catch(()=>{})
}

function beep(freq: number, durMs: number, type: OscillatorType = 'sine'){
  if(!isSfxOn()) return
  ensure()
  if(!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  const t0 = ctx.currentTime
  const t1 = t0 + durMs/1000
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.8, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t1)
  o.connect(g)
  g.connect(master)
  o.start(t0)
  o.stop(t1)
}

function noise(durMs: number){
  if(!isSfxOn()) return
  ensure()
  if(!ctx || !master) return
  const buffer = ctx.createBuffer(1, ctx.sampleRate * (durMs/1000), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * 0.35
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const g = ctx.createGain()
  const t0 = ctx.currentTime
  const t1 = t0 + durMs/1000
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t1)
  src.connect(g)
  g.connect(master)
  src.start(t0)
  src.stop(t1)
}

export type SfxKey =
  | 'click'
  | 'spin'
  | 'stop'
  | 'win'
  | 'lose'
  | 'plinko_tick'
  | 'plinko_drop'
  | 'plinko_hit'
  | 'mine_safe'
  | 'mine_boom'
  | 'cashout'
  | 'bonus'
  | 'case_spin'
  | 'case_stop'
  | 'dice_tick'
  | 'dice_stop'
  | 'ui_tick'
  | 'big_win'

export function sfx(kind: SfxKey | string) {
  if(!isSfxOn()) return

  const now = performance.now()
  const minInterval: Partial<Record<SfxKey, number>> = {
    dice_tick: 180,
    plinko_tick: 70,
    plinko_hit: 35,
    spin: 90,
  }
  const mi = minInterval[kind as SfxKey]

  // per-kind last played timestamp
  ;(sfx as any)._last = (sfx as any)._last || new Map<string, number>()
  const last: Map<string, number> = (sfx as any)._last
  if(mi){
    const prev = last.get(kind) || 0
    if(now - prev < mi) return
    last.set(kind, now)
  }

  const k = kind === 'ui_tick' ? 'click' : kind

  switch(k){
    case 'click':
      beep(520, 70, 'triangle')
      break

    // roulette
    case 'spin':
      noise(220)
      beep(220, 120, 'sawtooth')
      break
    case 'stop':
      beep(280, 90, 'square')
      break

    // generic
    case 'win':
      beep(660, 110, 'triangle')
      beep(880, 170, 'sine')
      break
    case 'lose':
      beep(180, 210, 'sawtooth')
      break

    // plinko
    case 'plinko_drop':
      beep(220, 120, 'sawtooth')
      break
    case 'plinko_tick':
      beep(420, 55, 'triangle')
      break
    case 'plinko_hit': {
      ensureFiles()
      const list = (plinkoBounceUrls || []).filter(Boolean)
      if(list.length){
        const idx = Math.floor(Math.random() * list.length)
        playFile(list[idx], 0.01)
      } else {
        playFile('/sfx/plinko_bounce.mp3', 0.01)
      }
      break
    }

    // mines
    case 'mine_safe':
      beep(620, 80, 'triangle')
      break
    case 'mine_boom':
      noise(260)
      beep(120, 180, 'sawtooth')
      break
    case 'cashout':
      beep(520, 90, 'square')
      beep(740, 120, 'triangle')
      break

    // cases
    case 'case_spin':
      noise(360)
      beep(240, 140, 'sawtooth')
      break
    case 'case_stop':
      beep(320, 90, 'square')
      break

    // dice
    case 'dice_tick':
      beep(460, 50, 'triangle')
      break
    case 'dice_stop':
      beep(300, 90, 'square')
      break

    // reserved
    case 'bonus':
      beep(900, 80, 'sine')
      beep(1200, 120, 'triangle')
      break

    // overlay / misc
    case 'big_win':
      beep(740, 120, 'triangle')
      beep(980, 160, 'sine')
      break

    default:
      // ignore unknown keys
      break
  }
}
