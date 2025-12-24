const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, getBearerToken, requireEnv, rndId, round2 } = require('../_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const body = await readJson(req)
  const type = String(body.type || '')
  const amount = round2(body.amount || 0)
  if(type !== 'deposit' && type !== 'withdraw') return json(res, 400, { ok:false, message:'Bad ticket type' })
  if(amount <= 0) return json(res, 400, { ok:false, message:'Bad amount' })

  const pool = getPool()
  const id = rndId(12)
  await pool.query(`INSERT INTO tickets (id, user_id, type, amount, status) VALUES ($1,$2,$3,$4,'pending')`, [
    id, payload.uid, type, amount
  ])
  return json(res, 200, { ok:true, id })
}