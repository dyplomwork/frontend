const { ensureSchema, getPool } = require('../../../_db.js')
const { json, readJson, round2 } = require('../../../_utils.js')
const { requireAdmin } = require('../../_guard.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  const admin = requireAdmin(req, res)
  if(!admin) return
  await ensureSchema()
  const userId = req.query?.id || req.params?.id || null
  // Vercel provides the param in the URL path; parse from req.url as fallback
  const m = new URL(req.url, `http://${req.headers.host}`).pathname.match(/\/api\/admin\/users\/(.+?)\/balance/)
  const id = userId || (m ? m[1] : null)
  if(!id) return json(res, 400, { ok:false, message:'Bad id' })

  const body = await readJson(req)
  const delta = round2(body.delta || 0)
  const pool = getPool()
  const client = await pool.connect()
  try{
    await client.query('BEGIN')
    const w = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [id])
    const cur = Number(w.rows[0]?.balance || 0)
    const next = round2(cur + delta)
    if(next < 0){ await client.query('ROLLBACK'); return json(res, 400, { ok:false, message:'Balance below zero' }) }
    await client.query(`INSERT INTO wallets(user_id,balance) VALUES ($1,$2)
      ON CONFLICT (user_id) DO UPDATE SET balance=$2, updated_at=NOW()`, [id, next])
    await client.query(`INSERT INTO transactions (user_id, type, amount, meta) VALUES ($1,'admin_adjust',$2,$3)`, [id, delta, JSON.stringify({ admin: admin.uid })])
    await client.query('COMMIT')
    return json(res, 200, { ok:true, balance: next })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}