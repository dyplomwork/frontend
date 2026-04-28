const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuid } = require('uuid')
const db = require('../utils/db')
const auth = require('../middleware/auth')
const { JWT_SECRET } = require('../utils/constants')

function safeUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    discord: user.discord,
    role: user.role || 'user',
    balance: user.balance,
  }
}

router.post('/auth/register', async (req, res) => {
  const { nickname, discord, password } = req.body

  if (!nickname || !discord || !password) {
    return res.status(400).json({ message: 'All fields are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password too short' })
  }

  const data = db.read()

  if (data.users.find(u => u.nickname === nickname)) {
    return res.status(400).json({ message: 'exists' })
  }

  const hash = await bcrypt.hash(password, 10)

  const user = {
    id: uuid(),
    nickname,
    discord,
    password: hash,
    role: 'user',
    balance: 1000,
  }

  data.users.push(user)
  db.write(data)

  const token = jwt.sign({ id: user.id }, JWT_SECRET)

  res.json({ ok: true, token, user: safeUser(user) })
})

router.post('/auth/login', async (req, res) => {
  const { login, password } = req.body

  if (!login || !password) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  const data = db.read()
  const user = data.users.find(u => u.nickname === login || u.discord === login)

  if (!user) return res.status(400).json({ message: 'not found' })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return res.status(400).json({ message: 'wrong' })

  const token = jwt.sign({ id: user.id }, JWT_SECRET)

  res.json({ ok: true, token, user: safeUser(user) })
})

router.post('/logout', auth, (req, res) => {
  res.json({ ok: true })
})

router.get('/users/me', auth, (req, res) => {
  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json({ ok: true, user: safeUser(user) })
})

router.get('/users/me/balance', auth, (req, res) => {
  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json({ ok: true, balance: user.balance })
})

module.exports = router
