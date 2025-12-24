const { ensureSchema, getPool } = require('../../../_db.js')
const { json, readJson, round2 } = require('../../../_utils.js')
const { requireAdmin } = require('../../_guard.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  const admin = requireAdmin(req, res)
  if(!admin) return
  await ensureSchema()
  const m = new URL(req.url, `http://${req.headers.host}`).pathname.match(/\/api\/admin\/tickets\/(.+?)\/reject/)
  const id = (req.query?.id || req.params?.id || (m ? m[1] : null))
  if(!id) return json(res, 400, { ok:false, message:'Bad id' })

  const pool = getPool()
  const client = await pool.connect()
  try{
    await client.query('BEGIN')
    const t = await client.query(`SELECT * FROM tickets WHERE id=$1 FOR UPDATE`, [id])
    const ticket = t.rows[0]
    if(!ticket){ await client.query('ROLLBACK'); return json(res, 404, { ok:false, message:'Ticket not found' }) }
    if(ticket.status !== 'pending'){ await client.query('ROLLBACK'); return json(res, 400, { ok:false, message:'Ticket already resolved' }) }

    let note = null
    try{ const body = await readJson(req); note = body?.note ? String(body.note) : null }catch{}

    const newStatus = 'rejected'
    await client.query(`UPDATE tickets SET status=$2, decided_at=NOW(), note=$3 WHERE id=$1`, [id, newStatus, note])

    // If approve: apply balance change
    if(newStatus === 'approved' && ticket.user_id){
      const delta = round2((ticket.type === 'deposit' ? 1 : -1) * Number(ticket.amount || 0))
      const w = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [ticket.user_id])
      const cur = Number(w.rows[0]?.balance || 0)
      const next = round2(cur + delta)
      if(next < 0){ await client.query('ROLLBACK'); return json(res, 400, { ok:false, message:'Balance below zero' }) }
      await client.query(`INSERT INTO wallets(user_id,balance) VALUES ($1,$2)
        ON CONFLICT (user_id) DO UPDATE SET balance=$2, updated_at=NOW()`, [ticket.user_id, next])
      await client.query(`INSERT INTO transactions (user_id, type, amount, meta) VALUES ($1,'ticket', $2, $3)`, [ticket.user_id, delta, JSON.stringify({ ticketId: id, admin: admin.uid })])
    }

    await client.query('COMMIT')
    return json(res, 200, { ok:true })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}