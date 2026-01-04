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
    modelEmoji: '🧰',
    loot: [
      { id: 's1', label: 'Common Sword', amount: 15, chance: 0.50 },
      { id: 's2', label: 'Rare Shield', amount: 15, chance: 0.30 },
      { id: 's3', label: 'Epic Armor', amount: 50, chance: 0.15 },
      { id: 's4', label: 'Legendary Weapon', amount: 200, chance: 0.05 },
    ],
  },
  {
    id: 'premium',
    name: 'Premium Case',
    price: 50,
    modelEmoji: '💎',
    loot: [
      { id: 'p1', label: 'Rare Gem', amount: 30, chance: 0.40 },
      { id: 'p2', label: 'Epic Potion', amount: 75, chance: 0.35 },
      { id: 'p3', label: 'Legendary Ring', amount: 150, chance: 0.20 },
      { id: 'p4', label: 'Mythic Artifact', amount: 500, chance: 0.05 },
    ],
  },
]
