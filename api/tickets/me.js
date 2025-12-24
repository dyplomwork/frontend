const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, getBearerToken, requireEnv } = require('../_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'GET') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const pool = getPool()
  const q = await pool.query(`
    SELECT t.id, t.user_id, u.nickname, t.type, t.amount, t.status,
           t.created_at, t.decided_at, t.note
    FROM tickets t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.user_id=$1
    ORDER BY t.created_at DESC
    LIMIT 100
  `, [payload.uid])

  const tickets = q.rows.map(r => ({
    id: r.id,
    userId: String(r.user_id),
    nickname: r.nickname || 'user',
    type: r.type,
    amount: Number(r.amount),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    resolvedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    note: r.note || null
  }))

  return json(res, 200, { ok:true, tickets })
}