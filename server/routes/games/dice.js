const router = require('express').Router()
const auth = require('../../middleware/auth')
const db = require('../../utils/db')

const HOUSE_EDGE = 0.01

function calcMultiplier(rollOver) {
  const winChance = 100 - rollOver
  return (100 * (1 - HOUSE_EDGE)) / winChance
}

router.get('/payout', (req, res) => {
  const rollOver = parseFloat(req.query.rollOver)
  if (isNaN(rollOver) || rollOver < 4 || rollOver > 95) {
    return res.status(400).json({ message: 'Invalid rollOver value (4-95)' })
  }

  const winChancePercentage = 100 - rollOver
  const payout = Math.round(calcMultiplier(rollOver) * 10000) / 10000

  res.json({ winChancePercentage, payout })
})

router.post('/play', auth, (req, res) => {
  const { bet, rollOver } = req.body

  if (!bet || bet <= 0) return res.status(400).json({ message: 'Invalid bet' })
  if (rollOver == null || rollOver < 4 || rollOver > 95) {
    return res.status(400).json({ message: 'Invalid rollOver (4-95)' })
  }

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  if (user.balance < bet) return res.status(400).json({ message: 'Insufficient balance' })

  const roll = Math.random() * 100
  const isWin = roll > rollOver
  const multiplier = calcMultiplier(rollOver)
  const payout = isWin ? Math.round(bet * multiplier * 100) / 100 : 0

  user.balance = Math.round((user.balance - bet + payout) * 100) / 100
  db.write(data)

  res.json({
    roll: Math.round(roll * 100) / 100,
    isWin,
    payout,
    balance: user.balance,
  })
})

module.exports = router
