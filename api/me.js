const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('./_db.js')
const { json, getBearerToken, requireEnv } = require('./_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'GET') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{
    payload = jwt.verify(token, requireEnv('JWT_SECRET'))
  }catch{
    return json(res, 401, { ok:false, message:'Unauthorized' })
  }

  const pool = getPool()
  const u = await pool.query(`SELECT id,nickname,discord,role FROM users WHERE id=$1`, [payload.uid])
  const user = u.rows[0]
  if(!user) return json(res, 401, { ok:false, message:'Unauthorized' })

  const w = await pool.query(`SELECT balance FROM wallets WHERE user_id=$1`, [user.id])
  const balance = Number(w.rows[0]?.balance || 0)

  return json(res, 200, { ok:true, user: { id:String(user.id), nickname:user.nickname, discord:user.discord || '', role:user.role, balance } })
}