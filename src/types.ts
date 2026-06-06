// ── Auth & user ───────────────────────────────────────────────────────────

export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  role: Role
  balance: number
  avatar_url?: string | null
}

// ── Tickets ───────────────────────────────────────────────────────────────

export type TicketType   = 'DEPOSIT' | 'WITHDRAW'
export type TicketStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type Ticket = {
  id: string
  userId: string
  nickname: string
  type: TicketType
  amount: number
  status: TicketStatus
  createdAt: string
  resolvedAt: string | null
  note?: string | null
}

// ── Cases ─────────────────────────────────────────────────────────────────

export type LootItem = {
  id: string
  label: string
  amount: number
  chance: number // 0..1
}

export type CaseDef = {
  id: string
  name: string
  price: number
  modelEmoji: string
  loot: LootItem[]
}
