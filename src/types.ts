// ── Auth & user ───────────────────────────────────────────────────────────

export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  role: Role
  balance: number
  avatar_url?: string | null
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
