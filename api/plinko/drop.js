const jwt = require('jsonwebtoken')
const { ensureSchema, getPool } = require('../_db.js')
const { json, readJson, getBearerToken, requireEnv, round2 } = require('../_utils.js')

const HOUSE_EDGE = 0.01

const baseTables = {
  'low:8':    [3, 1.5, 1.1, 1.0, 0.7, 1.0, 1.1, 1.5, 3],
  'medium:8': [8, 2.0, 1.3, 0.7, 0.3, 0.7, 1.3, 2.0, 8],
  'high:8':   [29, 4.0, 1.5, 0.5, 0.2, 0.5, 1.5, 4.0, 29],

  'low:12':    [5, 2.0, 1.6, 1.3, 1.1, 1.0, 0.8, 1.0, 1.1, 1.3, 1.6, 2.0, 5],
  'medium:12': [29, 8.0, 3.0, 1.6, 1.1, 0.8, 0.5, 0.8, 1.1, 1.6, 3.0, 8.0, 29],
  'high:12':   [120, 26, 8.0, 2.0, 1.0, 0.6, 0.2, 0.6, 1.0, 2.0, 8.0, 26, 120],

  'low:16':    [10, 3, 2, 1.6, 1.3, 1.1, 1.0, 0.8, 0.7, 0.8, 1.0, 1.1, 1.3, 1.6, 2, 3, 10],
  'medium:16': [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  'high:16':   [1000, 110, 41, 10, 5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5, 10, 41, 110, 1000],
}

function getTable(difficulty, rows){
  const key = `${difficulty}:${rows}`
  const t = baseTables[key]
  if(!t || t.length !== rows + 1) return null
  return t
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  await ensureSchema()
  const token = getBearerToken(req)
  if(!token) return json(res, 401, { ok:false, message:'Unauthorized' })

  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ return json(res, 401, { ok:false, message:'Unauthorized' }) }

  const body = await readJson(req)
  const amount = round2(body.amount || 0)
  const ballCount = Math.max(1, Math.min(50, Number(body.ballCount) || 1))
  const rows = Number(body.rows) || 16
  const difficulty = String(body.difficulty || 'medium')

  if(amount <= 0) return json(res, 400, { ok:false, message:'Укажи Amount' })
  const table = getTable(difficulty, rows)
  if(!table) return json(res, 400, { ok:false, message:'Bad rows/difficulty' })

  const totalBet = round2(amount * ballCount)

  const balls = []
  let totalReturn = 0

  for(let i=0;i<ballCount;i++){
    const rights = Array.from({length: rows}, () => Math.random() < 0.5)
    const landing = rights.reduce((a,b)=> a + (b?1:0), 0)
    const multiplier = table[landing]
    const payout = round2(amount * multiplier * (1 - HOUSE_EDGE))
    totalReturn = round2(totalReturn + payout)
    balls.push({ rights, landing, multiplier, payout })
  }

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
      VALUES ($1,'plinko',$2,$3,$4)`, [
      payload.uid,
      totalBet,
      JSON.stringify({ amount, rows, difficulty, ballCount, balls: balls.map(b=>({landing:b.landing, multiplier:b.multiplier, payout:b.payout})) }),
      totalReturn
    ])
    await client.query(`INSERT INTO transactions (user_id, type, amount, meta)
      VALUES ($1,'plinko',$2,$3)`, [payload.uid, net, JSON.stringify({ totalBet, totalReturn })])

    await client.query('COMMIT')
    return json(res, 200, { ok:true, balls, totalBet, totalReturn, net, balance: next })
  }catch(e){
    try{ await client.query('ROLLBACK') }catch{}
    return json(res, 500, { ok:false, message:'Server error' })
  }finally{
    client.release()
  }
}