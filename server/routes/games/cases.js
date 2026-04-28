const router = require('express').Router()
const auth = require('../../middleware/auth')
const db = require('../../utils/db')

const CASES = {
  starter: {
    id: 'starter',
    name: 'Starter Case',
    price: 10,
    items: [
      { name: 'Common Sword',     chance: 50, prize: 15  },
      { name: 'Rare Shield',      chance: 30, prize: 15  },
      { name: 'Epic Armor',       chance: 15, prize: 50  },
      { name: 'Legendary Weapon', chance: 5,  prize: 200 },
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium Case',
    price: 50,
    items: [
      { name: 'Rare Gem',        chance: 40, prize: 30  },
      { name: 'Epic Potion',     chance: 35, prize: 75  },
      { name: 'Legendary Ring',  chance: 20, prize: 150 },
      { name: 'Mythic Artifact', chance: 5,  prize: 500 },
    ],
  },
  elite: {
    id: 'elite',
    name: 'Elite Case',
    price: 100,
    items: [
      { name: 'Iron Dagger',        chance: 40, prize: 50   },
      { name: 'Enchanted Bow',      chance: 30, prize: 120  },
      { name: 'Dragon Sword',       chance: 20, prize: 300  },
      { name: 'Godslayer Artifact', chance: 10, prize: 1000 },
    ],
  },
}

function rollItem(items) {
  const totalChance = items.reduce((s, it) => s + it.chance, 0)
  let r = Math.random() * totalChance
  for (const it of items) {
    r -= it.chance
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

router.get('/:id', (req, res) => {
  const c = CASES[req.params.id]
  if (!c) return res.status(404).json({ message: 'Case not found' })
  res.json(c)
})

router.post('/play', auth, (req, res) => {
  const { type } = req.body
  const c = CASES[type]
  if (!c) return res.status(404).json({ message: 'Case not found' })

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  if (user.balance < c.price) return res.status(400).json({ message: 'Insufficient balance' })

  const item = rollItem(c.items)
  user.balance = Math.round((user.balance - c.price + item.prize) * 100) / 100
  db.write(data)

  res.json({ item: item.name, payout: item.prize, balance: user.balance })
})

module.exports = router
