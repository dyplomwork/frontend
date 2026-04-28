const router = require('express').Router()
const auth = require('../../middleware/auth')
const db = require('../../utils/db')

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

function getWinMultiplier(key, number) {
  if (key.startsWith('n:')) {
    const n = parseInt(key.slice(2), 10)
    return number === n ? 36 : 0
  }
  if (number === 0) return 0

  switch (key) {
    case 'red':    return RED_NUMBERS.has(number) ? 2 : 0
    case 'black':  return !RED_NUMBERS.has(number) ? 2 : 0
    case 'even':   return number % 2 === 0 ? 2 : 0
    case 'odd':    return number % 2 !== 0 ? 2 : 0
    case 'low':    return number >= 1 && number <= 18 ? 2 : 0
    case 'high':   return number >= 19 && number <= 36 ? 2 : 0
    case 'range:1': return number >= 1 && number <= 12 ? 3 : 0
    case 'range:2': return number >= 13 && number <= 24 ? 3 : 0
    case 'range:3': return number >= 25 && number <= 36 ? 3 : 0
    case 'row:1':  return number % 3 === 1 ? 3 : 0
    case 'row:2':  return number % 3 === 2 ? 3 : 0
    case 'row:3':  return number % 3 === 0 ? 3 : 0
    default:       return 0
  }
}

router.post('/play', auth, (req, res) => {
  const { bets } = req.body

  if (!Array.isArray(bets) || bets.length === 0) {
    return res.status(400).json({ message: 'No bets provided' })
  }

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })

  const totalBet = bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
  if (totalBet <= 0) return res.status(400).json({ message: 'Invalid bets' })
  if (user.balance < totalBet) return res.status(400).json({ message: 'Insufficient balance' })

  const number = Math.floor(Math.random() * 37)

  let totalPayout = 0
  for (const bet of bets) {
    const mult = getWinMultiplier(bet.key, number)
    totalPayout += (Number(bet.amount) || 0) * mult
  }

  user.balance = Math.round((user.balance - totalBet + totalPayout) * 100) / 100
  db.write(data)

  res.json({
    number,
    amount: totalPayout,
    balance: user.balance,
  })
})

module.exports = router
