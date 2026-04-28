const router = require('express').Router()
const auth = require('../../middleware/auth')
const db = require('../../utils/db')

const GRID_SIZE = 25
const ROWS = 5
const COLS = 5

const mineSessions = {}

function calcMultiplier(openedCount, minesCount) {
  if (openedCount === 0) return 1
  let p = 1
  for (let i = 0; i < openedCount; i++) {
    p *= (GRID_SIZE - minesCount - i) / (GRID_SIZE - i)
  }
  return Math.round((0.99 / p) * 100) / 100
}

function generateMinePositions(count) {
  const positions = new Set()
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * GRID_SIZE))
  }
  return [...positions]
}

function buildFieldDTO(minePositions, openedSet, forceReveal = false) {
  const field = []
  const opened = []
  for (let r = 0; r < ROWS; r++) {
    const fieldRow = []
    const openedRow = []
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const isMine = minePositions.includes(idx)
      const isOpened = openedSet.has(idx)
      fieldRow.push(forceReveal ? isMine : false)
      openedRow.push(isOpened)
    }
    field.push(fieldRow)
    opened.push(openedRow)
  }
  return { field, opened }
}

router.get('/game', auth, (req, res) => {
  const session = mineSessions[req.user.id]
  if (!session || !session.inGame) {
    return res.json({ bet: 0, minesCount: 0, opened: [] })
  }
  const openedList = [...session.openedSet].map(idx => ({
    row: Math.floor(idx / COLS),
    col: idx % COLS,
  }))
  res.json({ bet: session.bet, minesCount: session.minesCount, opened: openedList })
})

router.get('/multiplier', (req, res) => {
  const opened = parseInt(req.query.opened, 10) || 0
  const mines = parseInt(req.query.mines, 10) || 1
  if (mines < 1 || mines > 24) return res.status(400).json({ message: 'Invalid mines count' })
  res.json(calcMultiplier(opened, mines))
})

router.post('/start', auth, (req, res) => {
  const { bet, mines } = req.body
  if (!bet || bet <= 0) return res.status(400).json({ message: 'Invalid bet' })
  if (!mines || mines < 1 || mines > 24) return res.status(400).json({ message: 'Invalid mines count (1-24)' })

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  if (user.balance < bet) return res.status(400).json({ message: 'Insufficient balance' })

  user.balance = Math.round((user.balance - bet) * 100) / 100
  db.write(data)

  mineSessions[req.user.id] = {
    bet,
    minesCount: mines,
    minePositions: generateMinePositions(mines),
    openedSet: new Set(),
    inGame: true,
  }

  const nextMultiplier = calcMultiplier(1, mines)
  res.json({ ok: true, nextMultiplier, balance: user.balance })
})

router.post('/step', auth, (req, res) => {
  const { row, col } = req.body
  const session = mineSessions[req.user.id]

  if (!session || !session.inGame) {
    return res.status(400).json({ message: 'No active game' })
  }
  if (row == null || col == null || row < 0 || row >= ROWS || col < 0 || col >= COLS) {
    return res.status(400).json({ message: 'Invalid cell' })
  }

  const idx = row * COLS + col
  if (session.openedSet.has(idx)) {
    return res.status(400).json({ message: 'Cell already opened' })
  }

  const isMine = session.minePositions.includes(idx)

  if (isMine) {
    session.inGame = false
    const data = db.read()
    const user = data.users.find(u => u.id === req.user.id)

    const field = buildFieldDTO(session.minePositions, session.openedSet, true)
    field.opened[row][col] = true

    res.json({
      finish: true,
      nextMultiplier: null,
      field,
      balance: user ? user.balance : 0,
    })
    delete mineSessions[req.user.id]
  } else {
    session.openedSet.add(idx)
    const opened = session.openedSet.size
    const safeCells = GRID_SIZE - session.minesCount
    const allSafeOpened = opened >= safeCells

    if (allSafeOpened) {
      const multiplier = calcMultiplier(opened, session.minesCount)
      const win = Math.round(session.bet * multiplier * 100) / 100

      const data = db.read()
      const user = data.users.find(u => u.id === req.user.id)
      if (user) {
        user.balance = Math.round((user.balance + win) * 100) / 100
        db.write(data)
      }

      const field = buildFieldDTO(session.minePositions, session.openedSet, true)
      session.inGame = false
      delete mineSessions[req.user.id]

      return res.json({ finish: true, nextMultiplier: null, field, balance: user ? user.balance : 0 })
    }

    const nextMultiplier = calcMultiplier(opened + 1, session.minesCount)
    res.json({ finish: false, nextMultiplier, field: null })
  }
})

router.post('/finish', auth, (req, res) => {
  const session = mineSessions[req.user.id]
  if (!session || !session.inGame) {
    return res.status(400).json({ message: 'No active game' })
  }
  if (session.openedSet.size === 0) {
    return res.status(400).json({ message: 'Open at least one cell before cashing out' })
  }

  const multiplier = calcMultiplier(session.openedSet.size, session.minesCount)
  const win = Math.round(session.bet * multiplier * 100) / 100

  const data = db.read()
  const user = data.users.find(u => u.id === req.user.id)
  if (user) {
    user.balance = Math.round((user.balance + win) * 100) / 100
    db.write(data)
  }

  const field = buildFieldDTO(session.minePositions, session.openedSet, true)
  session.inGame = false
  delete mineSessions[req.user.id]

  res.json({ win, field, balance: user ? user.balance : 0 })
})

module.exports = router
