import { api, ApiError } from '../utils/api'
import { useAuthStore } from '../stores/auth'

export type CoinSide = 'heads' | 'tails'
export type BattleStatus = 'OPEN' | 'FULL' | 'APPROVING' | 'FINISHED' | 'CANCELLED'

export type BattleDTO = {
  id: string
  amount: number
  status: BattleStatus
  creatorId: string
  creatorNick: string
  creatorSide?: CoinSide | null
  joinerId?: string | null
  joinerNick?: string | null
  joinerSide?: CoinSide | null
  approvals?: Record<string, boolean> | null
  winnerId?: string | null
  winnerSide?: CoinSide | null
  resultSide?: CoinSide | null
  createdAt?: string | null
}

export type CreateBattleRequest = { amount: number; side?: CoinSide | null }
export type ApproveBattleRequest = { id: string; side?: CoinSide | null }

const LS_KEY = 'casino_mock_battles_v1'

function envBool(key: string, def = true): boolean {
  try {
    const v = (import.meta as any)?.env?.[key]
    if (v == null) return def
    const s = String(v).trim().toLowerCase()
    if (s === '0' || s === 'false' || s === 'off') return false
    if (s === '1' || s === 'true' || s === 'on') return true
    return def
  } catch {
    return def
  }
}

const MOCK_ENABLED = envBool('VITE_MOCK_BATTLES', true)

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
}

function loadMock(): BattleDTO[] {
  if (!isBrowser()) return []
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as BattleDTO[]) : []
  } catch {
    return []
  }
}

function saveMock(list: BattleDTO[]) {
  if (!isBrowser()) return
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

function coinFlip(): CoinSide {
  return Math.random() < 0.5 ? 'heads' : 'tails'
}

function mustAuth() {
  const auth = useAuthStore()
  if (!auth.user) throw new ApiError(401, 'Нужен вход')
  return auth.user
}

async function tryApi<T>(path: string, opts: any): Promise<T> {
  return api<T>(path, opts)
}

function shouldFallback(err: any): boolean {
  const st = Number(err?.status || 0)
  return MOCK_ENABLED && (st === 0 || st === 404 || st === 405)
}

export async function battlesList(): Promise<BattleDTO[]> {
  try {
    return await tryApi<BattleDTO[]>('/api/v1/battles', { method: 'GET' })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const list = loadMock()
    // newest first
    return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }
}

export async function battlesGet(id: string): Promise<BattleDTO> {
  try {
    return await tryApi<BattleDTO>(`/api/v1/battles/${encodeURIComponent(id)}`, { method: 'GET' })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const b = loadMock().find((x) => x.id === id)
    if (!b) throw new ApiError(404, 'Battle not found')
    return b
  }
}

export async function battlesCreate(req: CreateBattleRequest): Promise<BattleDTO> {
  try {
    return await tryApi<BattleDTO>('/api/v1/battles/create', { method: 'POST', json: true, body: req })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const u = mustAuth()
    const list = loadMock()
    const id = uid()
    const battle: BattleDTO = {
      id,
      amount: Math.max(0, Number(req.amount) || 0),
      status: 'OPEN',
      creatorId: String(u.id),
      creatorNick: u.nickname,
      creatorSide: req.side ?? null,
      createdAt: nowIso(),
      approvals: { [String(u.id)]: false },
    }
    list.unshift(battle)
    saveMock(list)
    return battle
  }
}

export async function battlesJoin(id: string): Promise<BattleDTO> {
  try {
    return await tryApi<BattleDTO>(`/api/v1/battles/join/${encodeURIComponent(id)}`, { method: 'POST' })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const u = mustAuth()
    const list = loadMock()
    const idx = list.findIndex((x) => x.id === id)
    if (idx < 0) throw new ApiError(404, 'Battle not found')
    const b = list[idx]
    if (b.status !== 'OPEN') throw new ApiError(400, 'Battle is not open')
    if (b.creatorId === String(u.id)) throw new ApiError(400, 'You are the creator')
    b.joinerId = String(u.id)
    b.joinerNick = u.nickname
    b.status = 'APPROVING'
    if (b.creatorSide) b.joinerSide = b.creatorSide === 'heads' ? 'tails' : 'heads'
    b.approvals = { ...(b.approvals || {}), [String(u.id)]: false }
    list[idx] = { ...b }
    saveMock(list)
    return list[idx]
  }
}

export async function battlesCancel(id: string): Promise<void> {
  try {
    await tryApi<void>(`/api/v1/battles/cancel/${encodeURIComponent(id)}`, { method: 'POST' })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const u = mustAuth()
    const list = loadMock()
    const idx = list.findIndex((x) => x.id === id)
    if (idx < 0) throw new ApiError(404, 'Battle not found')
    const b = list[idx]
    if (b.creatorId !== String(u.id)) throw new ApiError(403, 'Only creator can cancel')
    if (b.status !== 'OPEN') throw new ApiError(400, 'Only OPEN battle can be cancelled')
    b.status = 'CANCELLED'
    list[idx] = { ...b }
    saveMock(list)
  }
}

export async function battlesApprove(req: ApproveBattleRequest): Promise<BattleDTO> {
  try {
    return await tryApi<BattleDTO>('/api/v1/battles/approve', { method: 'POST', json: true, body: req })
  } catch (err: any) {
    if (!shouldFallback(err)) throw err
    const u = mustAuth()
    const list = loadMock()
    const idx = list.findIndex((x) => x.id === req.id)
    if (idx < 0) throw new ApiError(404, 'Battle not found')
    const b = list[idx]
    if (b.status !== 'APPROVING') throw new ApiError(400, 'Battle is not in approving state')
    const isCreator = b.creatorId === String(u.id)
    const isJoiner = b.joinerId === String(u.id)
    if (!isCreator && !isJoiner) throw new ApiError(403, 'Not a participant')

    if (req.side) {
      if (isCreator) b.creatorSide = req.side
      if (isJoiner) b.joinerSide = req.side
      if (b.creatorSide && !b.joinerSide && b.joinerId) b.joinerSide = b.creatorSide === 'heads' ? 'tails' : 'heads'
      if (b.joinerSide && !b.creatorSide) b.creatorSide = b.joinerSide === 'heads' ? 'tails' : 'heads'
    }

    b.approvals = { ...(b.approvals || {}), [String(u.id)]: true }

    const allApproved = !!b.creatorId && !!b.joinerId && !!b.approvals?.[b.creatorId] && !!b.approvals?.[b.joinerId]
    const sidesReady = !!b.creatorSide && !!b.joinerSide

    if (allApproved && sidesReady) {
      const resSide = coinFlip()
      b.resultSide = resSide
      b.winnerSide = resSide
      b.winnerId = b.creatorSide === resSide ? b.creatorId : (b.joinerId || null)
      b.status = 'FINISHED'
    }

    list[idx] = { ...b }
    saveMock(list)
    return list[idx]
  }
}
