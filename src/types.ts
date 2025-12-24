export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  email: string
  name: string
  role: Role
  balance: number
}

export type TicketType = 'deposit' | 'withdraw'
export type TicketStatus = 'pending' | 'approved' | 'rejected'

export type Ticket = {
  id: string
  userId: string
  type: TicketType
  amount: number
  status: TicketStatus
  createdAt: number
}

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
