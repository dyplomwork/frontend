import { api } from '../utils/api'

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
export type ApproveBattleRequest = { side?: CoinSide | null }

export async function battlesList(): Promise<BattleDTO[]> {
  return await api<BattleDTO[]>('/api/v1/battles', { method: 'GET' })
}

export async function battlesGet(id: string): Promise<BattleDTO> {
  return await api<BattleDTO>(`/api/v1/battles/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function battlesCreate(req: CreateBattleRequest): Promise<BattleDTO> {
  return await api<BattleDTO>('/api/v1/battles', { method: 'POST', json: true, body: req })
}

export async function battlesJoin(id: string): Promise<BattleDTO> {
  return await api<BattleDTO>(`/api/v1/battles/${encodeURIComponent(id)}/join`, { method: 'POST' })
}

export async function battlesCancel(id: string): Promise<void> {
  await api<void>(`/api/v1/battles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function battlesApprove(id: string, req: ApproveBattleRequest): Promise<BattleDTO> {
  return await api<BattleDTO>(`/api/v1/battles/${encodeURIComponent(id)}/approvals`, { method: 'POST', json: true, body: req })
}
