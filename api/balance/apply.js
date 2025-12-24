const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('./_db.js')
const { json, readJson, getBearerToken, requireEnv, round2 } = require('./_utils.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const body = await readJson(req)
  const delta = round2(body.delta || 0)
  if(!Number.isFinite(delta)) return json(res, 400, { ok:false, message:'Bad delta' })

  const pool = getPool()
  const client = await pool.connect()
  try{
    await client.query('BEGIN')
    const w = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [payload.uid])
    const cur = Number(w.rows[0]?.balance || 0)
    const next = round2(cur + delta)
    if(next < 0){
      await client.query('ROLLBACK')
      return json(res, 400, { ok:false, message:'Недостаточно баланса' })
    }
    await client.query(`INSERT INTO wallets(user_id,balance) VALUES ($1,$2)
      ON CONFLICT (user_id) DO UPDATE SET balance=$2, updated_at=NOW()`, [payload.uid, next])

    await client.query(`INSERT INTO transactions (user_id, type, amount, meta) VALUES ($1,$2,$3,$4)`, [
      payload.uid,
      delta >= 0 ? 'credit' : 'debit',
      delta,
      JSON.stringify({ source: 'balance_apply' })
    ])

    await client.query('COMMIT')
    return json(res, 200, { ok:true, balance: next })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}