const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('./_db.js')
const { json, getBearerToken, requireEnv } = require('./_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'GET') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const pool = getPool()
  const w = await pool.query(`SELECT balance FROM wallets WHERE user_id=$1`, [payload.uid])
  const balance = Number(w.rows[0]?.balance || 0)
  return json(res, 200, { ok:true, balance })
}