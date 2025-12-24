const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, requireEnv } = require('../_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const body = await readJson(req)
  const login = String(body.login || body.email || '').trim().toLowerCase()
  const password = String(body.password || '')

  const pool = getPool()
  const u = await pool.query(`SELECT id,email,nickname,discord,role,password_hash FROM users WHERE email=$1`, [login])
  const user = u.rows[0]
  if(!user) return json(res, 401, { ok:false, message:'Неверный логин или пароль' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if(!ok) return json(res, 401, { ok:false, message:'Неверный логин или пароль' })

  const w = await pool.query(`SELECT balance FROM wallets WHERE user_id=$1`, [user.id])
  const balance = Number(w.rows[0]?.balance || 0)

  const token = jwt.sign({ uid: user.id, role: user.role }, requireEnv('JWT_SECRET'), { expiresIn:'30d' })

  return json(res, 200, {
    ok: true,
    token,
    user: { id: String(user.id), nickname: user.nickname, discord: user.discord || '', role: user.role, balance }
  })
}