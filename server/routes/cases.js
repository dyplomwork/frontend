const router = require('express').Router()
const auth = require('../middleware/auth')
const db = require('../utils/db')

router.get('/', (req, res) => {
  res.json([
    { id: 1, price: 100 },
    { id: 2, price: 300 }
  ])
})

router.post('/open', auth, (req, res) => {
  const { caseId } = req.body
  const data = db.read()

  const user = data.users.find(u => u.id === req.user.id)

  const price = caseId === 1 ? 100 : 300

  if (user.balance < price) return res.sendStatus(400)

  const reward = Math.random() > 0.5 ? price * 2 : 0

  user.balance += reward - price

  db.write(data)

  res.json({ reward, balance: user.balance })
})

module.exports = router