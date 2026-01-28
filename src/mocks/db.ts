export type User = { id: string; nickname: string; discord: string; role: 'user' | 'admin'; balance: number }

export type CoinSide = 'heads' | 'tails'
export type BattleStatus = 'OPEN' | 'FULL' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED' | 'CANCELLED' | 'ABANDONED'

export type Battle = {
  id: string
  amount: number
  status: BattleStatus
  creatorId: string
  creatorNick: string
  creatorSide: CoinSide | null
  creatorReady: boolean
  joinerId: string | null
  joinerNick: string | null
  joinerSide: CoinSide | null
  joinerReady: boolean
  countdownStartedAt: string | null
  winnerId: string | null
  winnerSide: CoinSide | null
  resultSide: CoinSide | null
  createdAt: string
  updatedAt: string
}

const nowIso = () => new Date().toISOString()

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

const lsKeyUser = 'mock_user_v1'
const lsKeyToken = 'mock_token_v1'
const lsKeyBattles = 'mock_battles_v1'

export function getMockToken(): string {
  const t = localStorage.getItem(lsKeyToken)
  if (t) return t
  const nt = rid('t')
  localStorage.setItem(lsKeyToken, nt)
  return nt
}

export function getOrCreateUser(): User {
  const raw = localStorage.getItem(lsKeyUser)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {}
  }
  const u: User = { id: rid('u'), nickname: 'Tester', discord: 'tester', role: 'user', balance: 10000 }
  localStorage.setItem(lsKeyUser, JSON.stringify(u))
  return u
}

export function setUser(u: User) {
  localStorage.setItem(lsKeyUser, JSON.stringify(u))
}

export function clearUser() {
  localStorage.removeItem(lsKeyUser)
  localStorage.removeItem(lsKeyToken)
}

function loadBattles(): Record<string, Battle> {
  const raw = localStorage.getItem(lsKeyBattles)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveBattles(map: Record<string, Battle>) {
  localStorage.setItem(lsKeyBattles, JSON.stringify(map))
}

let battles = loadBattles()

function seedInitial() {
  if (Object.keys(battles).length) return
  const u = getOrCreateUser()
  for (let i = 0; i < 3; i++) {
    const id = rid('b')
    const createdAt = nowIso()
    const b: Battle = {
      id,
      amount: (i + 1) * 100,
      status: 'OPEN',
      creatorId: u.id,
      creatorNick: u.nickname,
      creatorSide: i % 2 === 0 ? 'heads' : 'tails',
      creatorReady: false,
      joinerId: null,
      joinerNick: null,
      joinerSide: null,
      joinerReady: false,
      countdownStartedAt: null,
      winnerId: null,
      winnerSide: null,
      resultSide: null,
      createdAt,
      updatedAt: createdAt,
    }
    battles[id] = b
  }
  saveBattles(battles)
}

seedInitial()

export function listBattles(): Battle[] {
  advanceAll()
  return Object.values(battles).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getBattle(id: string): Battle | null {
  const b = battles[id]
  if (!b) return null
  const nb = advanceOne(b)
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function createBattle(amount: number, side: CoinSide | null, me: User): Battle {
  const id = rid('b')
  const createdAt = nowIso()
  const b: Battle = {
    id,
    amount,
    status: 'OPEN',
    creatorId: me.id,
    creatorNick: me.nickname,
    creatorSide: side,
    creatorReady: false,
    joinerId: null,
    joinerNick: null,
    joinerSide: null,
    joinerReady: false,
    countdownStartedAt: null,
    winnerId: null,
    winnerSide: null,
    resultSide: null,
    createdAt,
    updatedAt: createdAt,
  }
  battles[id] = b
  saveBattles(battles)
  return b
}

export function joinBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status !== 'OPEN') return b
  if (b.creatorId === me.id) return b
  const nb: Battle = {
    ...b,
    status: 'FULL',
    joinerId: me.id,
    joinerNick: me.nickname,
    joinerSide: b.creatorSide ? (b.creatorSide === 'heads' ? 'tails' : 'heads') : null,
    updatedAt: nowIso(),
  }
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function leaveBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status === 'RUNNING' || b.status === 'FINISHED') return b
  if (b.creatorId === me.id) {
    const nb: Battle = { ...b, status: 'CANCELLED', updatedAt: nowIso() }
    battles[id] = nb
    saveBattles(battles)
    return nb
  }
  if (b.joinerId !== me.id) return b
  const nb: Battle = {
    ...b,
    status: 'OPEN',
    joinerId: null,
    joinerNick: null,
    joinerSide: null,
    joinerReady: false,
    countdownStartedAt: null,
    updatedAt: nowIso(),
  }
  battles[id] = nb
  saveBattles(battles)
  return nb
}

export function cancelBattle(id: string, me: User): boolean {
  const b = getBattle(id)
  if (!b) return false
  if (b.creatorId !== me.id) return false
  const nb: Battle = { ...b, status: 'CANCELLED', updatedAt: nowIso() }
  battles[id] = nb
  saveBattles(battles)
  return true
}

export function readyBattle(id: string, me: User): Battle | null {
  const b = getBattle(id)
  if (!b) return null
  if (b.status === 'CANCELLED' || b.status === 'ABANDONED') return b
  let nb = { ...b }
  if (me.id === b.creatorId) nb.creatorReady = true
  if (me.id === b.joinerId) nb.joinerReady = true

  const both = !!nb.joinerId && nb.creatorReady && nb.joinerReady
  if (both && (nb.status === 'FULL' || nb.status === 'OPEN')) {
    nb.status = 'COUNTDOWN'
    nb.countdownStartedAt = nowIso()
  }
  nb.updatedAt = nowIso()
  battles[id] = nb
  saveBattles(battles)
  return nb
}

function resultFromId(id: string): CoinSide {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 2 === 0 ? 'heads' : 'tails'
}

function advanceOne(b: Battle): Battle {
  if (b.status === 'COUNTDOWN') {
    const started = b.countdownStartedAt ? new Date(b.countdownStartedAt).getTime() : 0
    if (!started) return b
    const elapsed = Date.now() - started
    if (elapsed >= 3000) {
      const res = resultFromId(b.id)
      const winnerId =
        res === (b.creatorSide || res) ? b.creatorId : b.joinerId || b.creatorId
      const winnerSide: CoinSide =
        winnerId === b.creatorId ? (b.creatorSide || res) : (b.joinerSide || (b.creatorSide ? (b.creatorSide === 'heads' ? 'tails' : 'heads') : res))
      return {
        ...b,
        status: 'FINISHED',
        resultSide: res,
        winnerId,
        winnerSide,
        updatedAt: nowIso(),
      }
    }
  }
  return b
}

function advanceAll() {
  const ids = Object.keys(battles)
  let changed = false
  for (const id of ids) {
    const b = battles[id]
    const nb = advanceOne(b)
    if (nb !== b) {
      battles[id] = nb
      changed = true
    }
  }
  if (changed) saveBattles(battles)
}

export function mockBalanceFor(me: User): number {
  const u = getOrCreateUser()
  return u.balance
}

export function applyBalanceDelta(delta: number) {
  const u = getOrCreateUser()
  const nu = { ...u, balance: Math.max(0, Number(u.balance || 0) + delta) }
  setUser(nu)
  return nu.balance
}
