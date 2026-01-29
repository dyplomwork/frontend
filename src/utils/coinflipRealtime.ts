type Unsub = () => void

type BattleLike = any

type Msg = { type: string; battle?: BattleLike; id?: string }

function isOn(v: any) {
  const s = String(v || '').toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function isMock() {
  return isOn((import.meta.env as any).VITE_MOCK_API)
}

function makeChannel() {
  if (typeof window === 'undefined') return null
  const BC = (window as any).BroadcastChannel
  if (!BC) return null
  try {
    return new BC('scx_coinflip')
  } catch {
    return null
  }
}

export function subscribeBattle(id: string, onBattle: (b: BattleLike) => void): Unsub {
  if (!id) return () => {}

  if (isMock()) {
    const ch = makeChannel()
    if (ch) {
      const onMsg = (e: any) => {
        const d: Msg = e?.data
        if (d && d.type === 'battle' && d.battle && String((d.battle as any).id) === String(id)) onBattle(d.battle)
      }
      ch.addEventListener('message', onMsg)
      return () => {
        ch.removeEventListener('message', onMsg)
        try {
          ch.close()
        } catch {
        }
      }
    }
    return () => {}
  }

  if (typeof window !== 'undefined') {
    const ES = (window as any).EventSource
    if (ES) {
      const url = `/api/v1/battles/${encodeURIComponent(id)}/events`
      let es: any = null
      try {
        es = new ES(url)
      } catch {
        es = null
      }
      if (es) {
        es.onmessage = (ev: any) => {
          try {
            const data = JSON.parse(ev.data)
            if (data && data.id) onBattle(data)
          } catch {
          }
        }
        es.onerror = () => {
          try {
            es.close()
          } catch {
          }
        }
        return () => {
          try {
            es.close()
          } catch {
          }
        }
      }
    }
  }

  return () => {}
}

export function subscribeBattles(onAny: () => void): Unsub {
  if (!isMock()) return () => {}
  const ch = makeChannel()
  if (!ch) return () => {}
  const onMsg = (e: any) => {
    const d: Msg = e?.data
    if (!d) return
    if (d.type === 'battles') onAny()
    if (d.type === 'battle') onAny()
  }
  ch.addEventListener('message', onMsg)
  return () => {
    ch.removeEventListener('message', onMsg)
    try {
      ch.close()
    } catch {
    }
  }
}

export function publishMockEvent(msg: Msg) {
  if (!isMock()) return
  const ch = makeChannel()
  if (!ch) return
  try {
    ch.postMessage(msg)
  } catch {
  }
  try {
    ch.close()
  } catch {
  }
}
