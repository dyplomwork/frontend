const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, getBearerToken, requireEnv, round2 } = require('../_utils.js')

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

function colorOf(n){
  if(n === 0) return 'green'
  return RED.has(n) ? 'red' : 'black'
}

function payoutFor(key, win){
  // returns multiplier INCLUDING stake (e.g., 2 for even/odd, 36 for straight)
  if(key.startsWith('n:')){
    const num = Number(key.slice(2))
    return num === win ? 36 : 0
  }
  const c = colorOf(win)
  switch(key){
    case 'red': return c === 'red' ? 2 : 0
    case 'black': return c === 'black' ? 2 : 0
    case 'even': return win !== 0 && win % 2 === 0 ? 2 : 0
    case 'odd': return win % 2 === 1 ? 2 : 0
    case 'low': return win >= 1 && win <= 18 ? 2 : 0
    case 'high': return win >= 19 && win <= 36 ? 2 : 0
    case 'doz1': return win >= 1 && win <= 12 ? 3 : 0
    case 'doz2': return win >= 13 && win <= 24 ? 3 : 0
    case 'doz3': return win >= 25 && win <= 36 ? 3 : 0
    case 'col1': return win !== 0 && ((win - 1) % 3 === 0) ? 3 : 0
    case 'col2': return win !== 0 && ((win - 2) % 3 === 0) ? 3 : 0
    case 'col3': return win !== 0 && (win % 3 === 0) ? 3 : 0
    default: return 0
  }
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const body = await readJson(req)
  const bets = body.bets && typeof body.bets === 'object' ? body.bets : {}
  const entries = Object.entries(bets).map(([k,v]) => [String(k), round2(v)]).filter(([,v]) => Number.isFinite(v) && v > 0)

  const totalBet = round2(entries.reduce((a,[,v])=> a + Number(v), 0))
  if(totalBet <= 0) return json(res, 400, { ok:false, message:'Сделай ставку' })
  if(totalBet < 1 || totalBet > 10000) return json(res, 400, { ok:false, message:'Лимит ставки 1..10000' })

  const winNumber = Math.floor(Math.random() * 37)
  let totalReturn = 0
  for(const [k, amt] of entries){
    totalReturn += Number(amt) * payoutFor(k, winNumber)
  }
  totalReturn = round2(totalReturn)
  const net = round2(totalReturn - totalBet)

  const pool = getPool()
  const client = await pool.connect()
  try{
    await client.query('BEGIN')
    const w = await client.query(`SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, [payload.uid])
    const cur = Number(w.rows[0]?.balance || 0)
    if(cur < totalBet){
      await client.query('ROLLBACK')
      return json(res, 400, { ok:false, message:'Недостаточно баланса' })
    }
    const next = round2(cur + net)
    await client.query(`UPDATE wallets SET balance=$2, updated_at=NOW() WHERE user_id=$1`, [payload.uid, next])

    await client.query(`INSERT INTO game_rounds (user_id, game, bet_total, result, payout)
      VALUES ($1,'roulette',$2,$3,$4)`, [
      payload.uid,
      totalBet,
      JSON.stringify({ winNumber, color: colorOf(winNumber), bets }),
      totalReturn
    ])
    await client.query(`INSERT INTO transactions (user_id, type, amount, meta)
      VALUES ($1,'roulette', $2, $3)`, [payload.uid, net, JSON.stringify({ totalBet, totalReturn, winNumber })])

    await client.query('COMMIT')
    return json(res, 200, {
      ok:true,
      winNumber,
      color: colorOf(winNumber),
      totalBet,
      totalReturn,
      net,
      balance: next
    })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}