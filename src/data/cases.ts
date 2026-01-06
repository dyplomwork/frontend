import type { CaseDef } from '../types'

/**
 * Must match cases-game registry keys on backend (CaseRegistry.register(key, ...)).
 * Current backend keys: "starter" and "premium".
 */
export const CASES: CaseDef[] = [
  {
    id: 'starter',
    name: 'Starter Case',
    price: 10,
    modelEmoji: '🟦',
    loot: [
      { id: 's1', label: 'Common Sword', amount: 15, chance: 0.5 },
      { id: 's2', label: 'Rare Shield', amount: 15, chance: 0.3 },
      { id: 's3', label: 'Epic Armor', amount: 50, chance: 0.15 },
      { id: 's4', label: 'Legendary Weapon', amount: 200, chance: 0.05 },
    ],
  },
  {
    id: 'premium',
    name: 'Premium Case',
    modelEmoji: '🟪',
    price: 50,
    loot: [
      { id: 'p1', label: 'Rare Gem', amount: 30, chance: 0.4 },
      { id: 'p2', label: 'Epic Potion', amount: 75, chance: 0.35 },
      { id: 'p3', label: 'Legendary Ring', amount: 150, chance: 0.2 },
      { id: 'p4', label: 'Mythic Artifact', amount: 500, chance: 0.05 },
    ],
  },
  {
    id: 'elite', // 👈 обязательно совпадает с register("elite", ...)
    name: 'Elite Case',
    modelEmoji: '👑',
    price: 100, // можно для UI, но реальная цена придёт с бэка
    loot: [], // можно пусто, если ты гидратишь всё с бэка
  },
]
