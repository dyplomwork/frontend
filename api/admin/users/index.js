const { ensureSchema, getPool } = require('../../_db.js')
const { json } = require('../../_utils.js')
const { requireAdmin } = require('../_guard.js')

module.exports = async function handler(req, res){
  if(req.method !== 'GET') return json(res, 405, { ok:false, message:'Method not allowed' })
  const admin = requireAdmin(req, res)
  if(!admin) return
  await ensureSchema()
  const pool = getPool()
  const q = await pool.query(`
    SELECT u.id, u.nickname, u.discord, u.role, COALESCE(w.balance,0) AS balance
    FROM users u
    LEFT JOIN wallets w ON w.user_id=u.id
    ORDER BY u.id DESC
    LIMIT 200
  `)
  const users = q.rows.map(r => ({
    id: String(r.id),
    nickname: r.nickname,
    discord: r.discord || '',
    role: r.role,
    balance: Number(r.balance),
  }))
  return json(res, 200, { ok:true, users })
}