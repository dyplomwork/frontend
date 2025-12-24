const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, requireEnv } = require('../_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const nickname = String(body.nickname || email.split('@')[0] || 'user').trim() || 'user'
  const discord = String(body.discord || '').trim()

  if(!email || !email.includes('@')) return json(res, 400, { ok:false, message:'Введите корректный email' })
  if(password.length < 6) return json(res, 400, { ok:false, message:'Пароль минимум 6 символов' })

  const pool = getPool()
  const hash = await bcrypt.hash(password, 10)

  try{
    const u = await pool.query(
      `INSERT INTO users (email, nickname, discord, password_hash, role)
       VALUES ($1,$2,$3,$4,'user')
       RETURNING id, email, nickname, discord, role`,
      [email, nickname, discord, hash]
    )
    const user = u.rows[0]

    // стартовый баланс для UX (можно поменять на 0)
    const startBalance = 100
    await pool.query(`INSERT INTO wallets (user_id, balance) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING`, [user.id, startBalance])
    await pool.query(`INSERT INTO transactions (user_id, type, amount, meta) VALUES ($1,'bonus',$2,$3)`, [user.id, startBalance, JSON.stringify({ reason:'welcome' })])

    const token = jwt.sign({ uid: user.id, role: user.role }, requireEnv('JWT_SECRET'), { expiresIn:'30d' })

    return json(res, 200, {
      ok: true,
      token,
      user: { id: String(user.id), nickname: user.nickname, discord: user.discord || '', role: user.role, balance: startBalance }
    })
  }catch(e){
    const msg = String(e?.message || '')
    if(msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')){
      return json(res, 409, { ok:false, message:'Email уже занят' })
    }
    return json(res, 500, { ok:false, message:'Server error' })
  }
}