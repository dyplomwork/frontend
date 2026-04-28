const router = require('express').Router()
const auth = require('../../middleware/auth')
const db = require('../../utils/db')

const MULTIPLIERS = {
  low: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    12: [5.1, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 5.1],
    16: [16.0, 9.0, 2.0, 1.4, 1.4, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 1.4, 1.4, 2.0, 9.0, 16.0],
  },
  medium: {
    8:  [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
    12: [33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0],
    16: [110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0],
  },
  high: {
    8:  [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
    12: [141.0, 22.0, 5.0, 2.0, 0.4, 0.2, 0.2, 0.2, 0.4, 2.0, 5.0, 22.0, 141.0],
    16: [1000.0, 130.0, 26.0, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26.0, 130.0, 1000.0],
  },
}

function getTable(rows, difficulty) {
  const diff = (difficulty || 'MEDIUM').toLowerCase()
  const r = parseInt(rows, 10) || 16
  const key = [8, 12, 16].includes(r) ? r : 16
  const d = ['low', 'medium', 'high'].includes(diff) ? diff : 'medium'
  return MULTIPLIERS[d][key]
}

function dropBall(rows) {
  let mask = 0
  let landing = 0
  for (let i = 0; i < rows; i++) {
    const goRight = Math.random() < 0.5
    if (goRight) {
      landing++
      mask |= (1 << i)
    }
  }
  return { mask, landing }
}

router.get('/multipliers', (req, res) => {
  const { rows, difficulty } = req.query
  const table = getTable(rows, difficulty)
  res.json(table)
})

router.post('/play', auth, (req, res) => {
  const { bet, rows, difficulty, balls } = req.body
  if (!bet || bet <= 0) return res.status(400).json({ message: 'Invalid bet' })

  const ballCount = Math.max(1, Math.min(10, parseInt(balls, 10) || 1))
  const table = getTable(rows, difficulty)

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })

  const totalCost = bet * ballCount
  if (user.balance < totalCost) return res.status(400).json({ message: 'Insufficient balance' })

  user.balance = Math.round((user.balance - totalCost) * 100) / 100

  const rowCount = [8, 12, 16].includes(parseInt(rows, 10)) ? parseInt(rows, 10) : 16
  const traces = []
  let total = 0

  for (let i = 0; i < ballCount; i++) {
    const { mask, landing } = dropBall(rowCount)
    const multiplier = table[landing] || 0
    const win = Math.round(bet * multiplier * 100) / 100
    total += win
    traces.push({ win, mask })
  }

  user.balance = Math.round((user.balance + total) * 100) / 100
  db.write(data)

  res.json({ total, traces, balance: user.balance })
})

module.exports = router
