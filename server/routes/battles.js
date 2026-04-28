const router = require('express').Router()
const { v4: uuid } = require('uuid')
const auth = require('../middleware/auth')
const db = require('../utils/db')

const sseClients = {}

function broadcast(battleId, battle) {
  const clients = sseClients[battleId] || []
  const payload = `data: ${JSON.stringify(battle)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch {}
  }
}

function removeClient(battleId, res) {
  if (!sseClients[battleId]) return
  sseClients[battleId] = sseClients[battleId].filter(r => r !== res)
}

function resolveBattle(battle, data) {
  const sides = ['heads', 'tails']
  const resultSide = sides[Math.floor(Math.random() * 2)]

  const creatorSide = battle.creatorSide || 'heads'
  const joinerSide = creatorSide === 'heads' ? 'tails' : 'heads'

  if (!battle.joinerSide) battle.joinerSide = joinerSide

  const winnerId = resultSide === creatorSide ? battle.creatorId : battle.joinerId
  const winnerSide = resultSide

  battle.resultSide = resultSide
  battle.winnerId = winnerId
  battle.winnerSide = winnerSide
  battle.status = 'FINISHED'
  battle.updatedAt = new Date().toISOString()

  const winner = data.users.find(u => u.id === winnerId)
  if (winner) {
    winner.balance = Math.round((winner.balance + battle.amount * 2) * 100) / 100
  }
}

router.get('/', (req, res) => {
  const data = db.read()
  res.json(data.battles || [])
})

router.post('/', auth, (req, res) => {
  const { amount, side } = req.body
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' })

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' })

  user.balance = Math.round((user.balance - amount) * 100) / 100

  const battle = {
    id: uuid(),
    amount,
    status: 'OPEN',
    creatorId: user.id,
    creatorNick: user.nickname,
    creatorSide: side || 'heads',
    creatorReady: false,
    joinerId: null,
    joinerNick: null,
    joinerSide: null,
    joinerReady: false,
    countdownStartedAt: null,
    winnerId: null,
    winnerSide: null,
    resultSide: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  if (!data.battles) data.battles = []
  data.battles.push(battle)
  db.write(data)

  res.json(battle)
})

router.get('/:id', (req, res) => {
  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === req.params.id)
  if (!battle) return res.status(404).json({ message: 'Battle not found' })
  res.json(battle)
})

router.delete('/:id', auth, (req, res) => {
  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === req.params.id)
  if (!battle) return res.status(404).json({ message: 'Battle not found' })
  if (battle.creatorId !== req.user.id) return res.status(403).json({ message: 'Forbidden' })
  if (!['OPEN', 'FULL'].includes(battle.status)) {
    return res.status(400).json({ message: 'Cannot cancel this battle' })
  }

  const user = data.users.find(u => u.id === req.user.id)
  if (user) user.balance = Math.round((user.balance + battle.amount) * 100) / 100

  if (battle.joinerId) {
    const joiner = data.users.find(u => u.id === battle.joinerId)
    if (joiner) joiner.balance = Math.round((joiner.balance + battle.amount) * 100) / 100
  }

  battle.status = 'CANCELLED'
  battle.updatedAt = new Date().toISOString()
  db.write(data)

  broadcast(battle.id, battle)
  res.json({ ok: true })
})

router.post('/:id/join', auth, (req, res) => {
  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === req.params.id)
  if (!battle) return res.status(404).json({ message: 'Battle not found' })
  if (battle.status !== 'OPEN') return res.status(400).json({ message: 'Battle is not open' })
  if (battle.creatorId === req.user.id) return res.status(400).json({ message: 'Cannot join your own battle' })

  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  if (user.balance < battle.amount) return res.status(400).json({ message: 'Insufficient balance' })

  user.balance = Math.round((user.balance - battle.amount) * 100) / 100

  const creatorSide = battle.creatorSide || 'heads'
  battle.joinerId = user.id
  battle.joinerNick = user.nickname
  battle.joinerSide = creatorSide === 'heads' ? 'tails' : 'heads'
  battle.joinerReady = false
  battle.status = 'FULL'
  battle.updatedAt = new Date().toISOString()

  db.write(data)
  broadcast(battle.id, battle)
  res.json(battle)
})

router.post('/:id/ready', auth, (req, res) => {
  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === req.params.id)
  if (!battle) return res.status(404).json({ message: 'Battle not found' })
  if (!['FULL'].includes(battle.status)) return res.status(400).json({ message: 'Battle is not in FULL state' })

  if (battle.creatorId === req.user.id) {
    battle.creatorReady = true
  } else if (battle.joinerId === req.user.id) {
    battle.joinerReady = true
  } else {
    return res.status(403).json({ message: 'Not a participant' })
  }

  battle.updatedAt = new Date().toISOString()

  if (battle.creatorReady && battle.joinerReady) {
    battle.status = 'COUNTDOWN'
    battle.countdownStartedAt = new Date().toISOString()
    resolveBattle(battle, data)
  }

  db.write(data)
  broadcast(battle.id, battle)
  res.json(battle)
})

router.post('/:id/leave', auth, (req, res) => {
  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === req.params.id)
  if (!battle) return res.status(404).json({ message: 'Battle not found' })
  if (battle.joinerId !== req.user.id) return res.status(403).json({ message: 'Only joiner can leave' })
  if (battle.status !== 'FULL') return res.status(400).json({ message: 'Cannot leave now' })

  const user = data.users.find(u => u.id === req.user.id)
  if (user) user.balance = Math.round((user.balance + battle.amount) * 100) / 100

  battle.joinerId = null
  battle.joinerNick = null
  battle.joinerSide = null
  battle.joinerReady = false
  battle.status = 'OPEN'
  battle.updatedAt = new Date().toISOString()

  db.write(data)
  broadcast(battle.id, battle)
  res.json(battle)
})

router.get('/:id/events', (req, res) => {
  const { id } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  if (!sseClients[id]) sseClients[id] = []
  sseClients[id].push(res)

  const data = db.read()
  const battle = (data.battles || []).find(b => b.id === id)
  if (battle) res.write(`data: ${JSON.stringify(battle)}\n\n`)

  req.on('close', () => removeClient(id, res))
})

module.exports = router
