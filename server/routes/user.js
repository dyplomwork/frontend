const router = require('express').Router()
const db = require('../utils/db')
const auth = require('../middleware/auth')

router.get('/', auth, (req, res) => {
  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)

  res.json({
    id: user.id,
    login: user.login,
    balance: user.balance
  })
})

module.exports = router