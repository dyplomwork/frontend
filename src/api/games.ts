import { api } from '../utils/api'

/**
 * Game microservices are exposed through the API Gateway with the following prefixes:
 *  - /api/v1/games/dice
 *  - /api/v1/games/roulette
 *  - /api/v1/games/mines
 *  - /api/v1/games/cases
 *
 * Each microservice internally uses /game/* routes.
 */

export type DicePlayRequest = { bet: number; rollOver: number }
export type DicePlayResponse = { roll: number; isWin: boolean; payout: number }
export type DicePayoutResponse = { winChancePercentage: number; payout: number }

export async function dicePlay(req: DicePlayRequest) {
  return api<DicePlayResponse>('/api/v1/games/dice/game/play', {
    method: 'POST',
    json: true,
    body: req
  })
}

export async function dicePayout(rollOver: number) {
  const q = new URLSearchParams({ rollOver: String(rollOver) })
  return api<DicePayoutResponse>(`/api/v1/games/dice/game/payout?${q.toString()}`)
}

export type RouletteBet = { key: string; amount: number }
export type RoulettePlayRequest = { bets: RouletteBet[] }
export type RoulettePlayResponse = { number: number; amount: number } // backend uses `amount` = payout

export function normalizeRouletteKey(key: string): string {
  const k = key.trim()
  // Frontend uses RU labels for dozens/rows in some UIs.
  if (k === 'Диапазон1') return 'range:1'
  if (k === 'Диапазон2') return 'range:2'
  if (k === 'Диапазон3') return 'range:3'
  if (k === 'Ряд1') return 'row:1'
  if (k === 'Ряд2') return 'row:2'
  if (k === 'Ряд3') return 'row:3'

  // Some older UI variants used doz/col.
  if (k === 'doz1') return 'range:1'
  if (k === 'doz2') return 'range:2'
  if (k === 'doz3') return 'range:3'
  if (k === 'col1') return 'row:1'
  if (k === 'col2') return 'row:2'
  if (k === 'col3') return 'row:3'

  return k
}

export async function roulettePlay(req: RoulettePlayRequest) {
  return api<RoulettePlayResponse>('/api/v1/games/roulette/game/play', {
    method: 'POST',
    json: true,
    body: req
  })
}

export type MinesCell = { row: number; col: number }
export type MinesSessionResponse = { bet: number; minesCount: number; opened: MinesCell[] }
export type MinesStartRequest = { bet: number; mines: number }
export type MinesStepRequest = { row: number; col: number }
export type MinesGameField = { field: boolean[][]; opened: boolean[][] }
export type MinesStepResponse = { finish: boolean; nextMultiplier?: number | null; field?: MinesGameField | null }
export type MinesFinishResponse = { win: number; field: MinesGameField }

export async function minesGetSession() {
  return api<MinesSessionResponse>('/api/v1/games/mines/game')
}

export async function minesStart(req: MinesStartRequest) {
  // backend returns 200 with no body
  return api<void>('/api/v1/games/mines/game/start', {
    method: 'POST',
    json: true,
    body: req
  })
}

export async function minesStep(req: MinesStepRequest) {
  return api<MinesStepResponse>('/api/v1/games/mines/game/step', {
    method: 'POST',
    json: true,
    body: req
  })
}

export async function minesFinish() {
  return api<MinesFinishResponse>('/api/v1/games/mines/game/finish', {
    method: 'POST'
  })
}

export async function minesMultiplier(opened: number, mines: number) {
  const q = new URLSearchParams({ opened: String(opened), mines: String(mines) })
  // backend returns BigDecimal as number-like
  return api<number>(`/api/v1/games/mines/game/multiplier?${q.toString()}`)
}

export type CasesPlayResponse = { item: string; payout: number }

export async function casesPlay(type: string) {
  return api<CasesPlayResponse>('/api/v1/games/cases/game/play', {
    method: 'POST',
    json: true,
    body: { type }
  })
}

// cases-service public DTOs
// NOTE: list endpoint does not include the registry key (id), only name/price/items.
export type CaseItemDTO = { name: string; chance: number; prize: number }
export type CaseDTO = { id?: string; name: string; price: number; items: CaseItemDTO[] }

export async function casesGet(id: string): Promise<CaseDTO> {
  return api<CaseDTO>(`/api/v1/games/cases/${encodeURIComponent(id)}`)
}
