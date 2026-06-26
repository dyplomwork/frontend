
export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  role: Role
  balance: number
  avatar_url?: string | null
}

export type LootItem = {
  id: string
  label: string
  amount: number
  chance: number
}

export type CaseDef = {
  id: string
  name: string
  price: number
  modelEmoji: string
  loot: LootItem[]
}
