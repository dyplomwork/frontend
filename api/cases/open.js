const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, getBearerToken, requireEnv, round2 } = require('../_utils.js')
const { CASES } = require('../_data/cases.js')

function pickLoot(loot){
  const weights = loot.map(x => {
    const w = Number(x.chance)
    return Number.isFinite(w) && w > 0 ? w : 0
  })
  const sum = weights.reduce((a,w)=>a+w,0)
  if(sum <= 0) return loot[loot.length - 1]
  let r = Math.random() * sum
  for(let i=0;i<loot.length;i++){
    r -= weights[i]
    if(r <= 0) return loot[i]
  }
  return loot[loot.length - 1]
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const body = await readJson(req)
  const caseId = String(body.caseId || '')
  const c = CASES.find(x => x.id === caseId)
  if(!c) return json(res, 404, { ok:false, message:'Case not found' })

  const price = round2(c.price)
  const loot = pickLoot(c.loot)
  const win = round2(loot.amount)

  const net = round2(win - price)

  const pool = getPool()
  const client = await pool.connect()
  try{
    await client.query('BEGIN')
    const w = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [payload.uid])
    const cur = Number(w.rows[0]?.balance || 0)
    if(cur < price){
      await client.query('ROLLBACK')
      return json(res, 400, { ok:false, message:'Недостаточно баланса' })
    }
    const next = round2(cur + net)
    await client.query(`UPDATE wallets SET balance=$2, updated_at=NOW() WHERE user_id=$1`, [payload.uid, next])

    await client.query(`INSERT INTO game_rounds (user_id, game, bet_total, result, payout)
      VALUES ($1,'cases',$2,$3,$4)`, [payload.uid, price, JSON.stringify({ caseId, loot }), win])
    await client.query(`INSERT INTO transactions (user_id, type, amount, meta)
      VALUES ($1,'cases',$2,$3)`, [payload.uid, net, JSON.stringify({ caseId, price, win })])

    await client.query('COMMIT')
    return json(res, 200, { ok:true, loot, balance: next })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}