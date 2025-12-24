import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_DIR = path.join(__dirname, 'db')
const USERS_FILE = path.join(DB_DIR, 'users.json')
const SESSIONS_FILE = path.join(DB_DIR, 'sessions.json')
const TICKETS_FILE = path.join(DB_DIR, 'tickets.json')

function ensureFiles(){
  fs.mkdirSync(DB_DIR, { recursive: true })
  if(!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]\n', 'utf-8')
  if(!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '{}\n', 'utf-8')
  if(!fs.existsSync(TICKETS_FILE)) fs.writeFileSync(TICKETS_FILE, '[]\n', 'utf-8')
}
ensureFiles()

function readJson(file, fallback){
  try{
    const raw = fs.readFileSync(file, 'utf-8')
    if(!raw || !raw.trim()) return fallback
    return JSON.parse(raw)
  }catch(err){
    console.error('[db] readJson failed', file, err)
    return fallback
  }
}
function writeJson(file, data){
  try{
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  }catch(err){
    console.error('[db] writeJson failed', file, err)
    throw err
  }
}
function uid(){
  return crypto.randomBytes(16).toString('hex')
}
function hashPassword(pw){
  // simple hash for demo (NOT for production)
  return crypto.createHash('sha256').update(pw).digest('hex')
}
function safeUser(u){
  const { passwordHash, ...rest } = u
  return rest
}

function normalizeDb(){
  const users = readJson(USERS_FILE, [])
  const sessions = readJson(SESSIONS_FILE, {})
  const tickets = readJson(TICKETS_FILE, [])
  if(!Array.isArray(users)) writeJson(USERS_FILE, [])
  if(typeof sessions !== 'object' || Array.isArray(sessions) || sessions === null) writeJson(SESSIONS_FILE, {})
  if(!Array.isArray(tickets)) writeJson(TICKETS_FILE, [])
}
normalizeDb()

function seed(){
  const users = readJson(USERS_FILE, [])
  const hasShara = Array.isArray(users) && users.some(u => String(u.nickname||'').toLowerCase() === 'shara')
  if(!hasShara){
    users.push({
      id: 'shara_admin',
      nickname: 'SHARA',
      discord: 'SHARA',
      passwordHash: hashPassword('SHARA'),
      role: 'admin',
      balance: 9999
    })
    writeJson(USERS_FILE, users)
  }
}
seed()

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

function authFromReq(req){
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if(!token) return null
  const sessions = readJson(SESSIONS_FILE, {})
  const tickets = readJson(TICKETS_FILE, [])
  const userId = sessions[token]
  if(!userId) return null
  const users = readJson(USERS_FILE, [])
  const user = users.find(u => u.id === userId)
  if(!user) return null
  return { token, user, users, sessions }
}

function requireAuth(req, res, next){
  const a = authFromReq(req)
  if(!a) return res.status(401).json({ ok:false, message:'Unauthorized' })
  req.auth = a
  next()
}
function requireAdmin(req, res, next){
  const a = authFromReq(req)
  if(!a) return res.status(401).json({ ok:false, message:'Unauthorized' })
  if(a.user.role !== 'admin') return res.status(403).json({ ok:false, message:'Forbidden' })
  req.auth = a
  next()
}

function wrap(fn){
  return (req,res,next)=> Promise.resolve(fn(req,res,next)).catch(next)
}

app.get('/api/health', (req,res)=>res.json({ ok:true }))

app.post('/api/auth/register', wrap(async (req,res)=>{
  const { nickname, discord, password } = req.body || {}
  const nick = String(nickname||'').trim()
  const disc = String(discord||'').trim()
  const pw = String(password||'')

  if(nick.length < 3) return res.status(400).json({ ok:false, message:'Никнейм минимум 3 символа' })
  if(!/^[\w\-\.]+$/.test(nick)) return res.status(400).json({ ok:false, message:'Никнейм: только буквы/цифры/._-' })
  if(disc.length < 1) return res.status(400).json({ ok:false, message:'Discord обязателен' })
  if(pw.length < 4) return res.status(400).json({ ok:false, message:'Пароль минимум 4 символа' })

  const users = readJson(USERS_FILE, [])
  const exists = users.some(u => String(u.nickname).toLowerCase() === nick.toLowerCase() || String(u.discord).toLowerCase() === disc.toLowerCase())
  if(exists) return res.status(409).json({ ok:false, message:'Никнейм или Discord уже заняты' })

  const u = {
    id: uid(),
    nickname: nick,
    discord: disc,
    passwordHash: hashPassword(pw),
    role: 'user',
    balance: 0
  }
  users.push(u)
  writeJson(USERS_FILE, users)

  const sessions = readJson(SESSIONS_FILE, {})
  const tickets = readJson(TICKETS_FILE, [])
  const token = uid()
  sessions[token] = u.id
  writeJson(SESSIONS_FILE, sessions)

  res.json({ ok:true, token, user: safeUser(u) })
}))

app.post('/api/auth/login', wrap(async (req,res)=>{
  const { login, password } = req.body || {}
  const l = String(login||'').trim().toLowerCase()
  const pw = String(password||'')
  const users = readJson(USERS_FILE, [])
  const u = users.find(x => String(x.nickname||'').toLowerCase() === l || String(x.discord||'').toLowerCase() === l)
  if(!u) return res.status(404).json({ ok:false, message:'Аккаунт не найден' })
  if(u.passwordHash !== hashPassword(pw)) return res.status(401).json({ ok:false, message:'Неверный пароль' })

  const sessions = readJson(SESSIONS_FILE, {})
  const tickets = readJson(TICKETS_FILE, [])
  const token = uid()
  sessions[token] = u.id
  writeJson(SESSIONS_FILE, sessions)

  res.json({ ok:true, token, user: safeUser(u) })
}))

app.post('/api/auth/logout', requireAuth, wrap(async (req,res)=>{
  const { token, sessions } = req.auth
  delete sessions[token]
  writeJson(SESSIONS_FILE, sessions)
  res.json({ ok:true })
}))

app.get('/api/me', requireAuth, wrap(async (req,res)=>{
  res.json({ ok:true, user: safeUser(req.auth.user) })
}))

app.get('/api/admin/users', requireAdmin, wrap(async (req,res)=>{
  res.json({ ok:true, users: req.auth.users.map(safeUser) })
}))

app.post('/api/admin/users/:id/balance', requireAdmin, wrap(async (req,res)=>{
  const id = req.params.id
  const value = Number(req.body?.value)
  if(!Number.isFinite(value)) return res.status(400).json({ ok:false, message:'Invalid value' })

  const users = req.auth.users.map(u => u.id === id ? { ...u, balance: Math.round(value*100)/100 } : u)
  writeJson(USERS_FILE, users)
  res.json({ ok:true })
}))

app.post('/api/admin/users/:id/role', requireAdmin, wrap(async (req,res)=>{
  const id = req.params.id
  const role = String(req.body?.role || '')
  if(!['user','admin'].includes(role)) return res.status(400).json({ ok:false, message:'Invalid role' })

  const users = req.auth.users.map(u => u.id === id ? { ...u, role } : u)
  writeJson(USERS_FILE, users)
  res.json({ ok:true })
}))

app.post('/api/balance/apply', requireAuth, wrap(async (req,res)=>{
  const delta = Number(req.body?.delta)
  if(!Number.isFinite(delta)) return res.status(400).json({ ok:false, message:'Invalid delta' })
  const me = req.auth.user
  const users = req.auth.users.map(u => u.id === me.id ? { ...u, balance: Math.round((u.balance+delta)*100)/100 } : u)
  writeJson(USERS_FILE, users)
  res.json({ ok:true })
}))


app.post('/api/tickets', requireAuth, wrap(async (req,res)=>{
  const type = String(req.body?.type || '')
  const amount = Number(req.body?.amount)
  if(!['deposit','withdraw'].includes(type)) return res.status(400).json({ ok:false, message:'Invalid type' })
  if(!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ ok:false, message:'Invalid amount' })

  const tickets = readJson(TICKETS_FILE, [])
  const t = {
    id: uid(),
    userId: req.auth.user.id,
    nickname: req.auth.user.nickname,
    type,
    amount: Math.round(amount*100)/100,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null
  }
  tickets.unshift(t)
  writeJson(TICKETS_FILE, tickets)
  res.json({ ok:true, ticket: t })
}))

app.get('/api/tickets/me', requireAuth, wrap(async (req,res)=>{
  const tickets = readJson(TICKETS_FILE, [])
  const mine = tickets.filter(t => t.userId === req.auth.user.id)
  res.json({ ok:true, tickets: mine })
}))

app.get('/api/admin/tickets', requireAdmin, wrap(async (req,res)=>{
  const tickets = readJson(TICKETS_FILE, [])
  res.json({ ok:true, tickets })
}))

app.post('/api/admin/tickets/:id/approve', requireAdmin, wrap(async (req,res)=>{
  const id = req.params.id
  const tickets = readJson(TICKETS_FILE, [])
  const t = tickets.find(x => x.id === id)
  if(!t) return res.status(404).json({ ok:false, message:'Ticket not found' })
  if(t.status !== 'pending') return res.status(409).json({ ok:false, message:'Ticket already resolved' })

  const users = readJson(USERS_FILE, [])
  const u = users.find(x => x.id === t.userId)
  if(!u) return res.status(404).json({ ok:false, message:'User not found' })

  if(t.type === 'withdraw' && u.balance < t.amount){
    t.status = 'rejected'
    t.resolvedAt = new Date().toISOString()
    t.note = 'Insufficient balance'
    writeJson(TICKETS_FILE, tickets)
    return res.status(409).json({ ok:false, message:'Недостаточно баланса для вывода' })
  }

  const delta = t.type === 'deposit' ? t.amount : -t.amount
  u.balance = Math.round((Number(u.balance) + delta)*100)/100

  t.status = 'approved'
  t.resolvedAt = new Date().toISOString()

  writeJson(USERS_FILE, users)
  writeJson(TICKETS_FILE, tickets)
  res.json({ ok:true })
}))

app.post('/api/admin/tickets/:id/reject', requireAdmin, wrap(async (req,res)=>{
  const id = req.params.id
  const tickets = readJson(TICKETS_FILE, [])
  const t = tickets.find(x => x.id === id)
  if(!t) return res.status(404).json({ ok:false, message:'Ticket not found' })
  if(t.status !== 'pending') return res.status(409).json({ ok:false, message:'Ticket already resolved' })
  t.status = 'rejected'
  t.resolvedAt = new Date().toISOString()
  t.note = String(req.body?.note || '').slice(0,140) || null
  writeJson(TICKETS_FILE, tickets)
  res.json({ ok:true })
}))

// Global error handler (prevents silent 500s)
app.use((err, req, res, next) => {
  console.error('[api] error', err)
  res.status(500).json({ ok:false, message: err?.message || 'Internal Server Error' })
})

const PORT = Number(process.env.PORT || 3001)

// Start server with a helpful error message if the port is already taken.
const server = app.listen(PORT, () => console.log('[api] listening on', PORT))
server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`\n[api] Port ${PORT} is already in use.`)
    console.error('[api] Fix: close the other process, or run with a different port:')
    console.error('      Windows (PowerShell): $env:PORT=3002; npm run dev')
    console.error('      macOS/Linux: PORT=3002 npm run dev\n')
  } else {
    console.error('[api] server error', err)
  }
  process.exit(1)
})
