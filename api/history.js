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

  const url = new URL(req.url, `http://${req.headers.host}`)
  const game = url.searchParams.get('game')
  const pool = getPool()

  const params=[payload.uid]
  let where="user_id=$1"
  if(game){
    params.push(game)
    where += " AND game=$2"
  }

  const q = await pool.query(
    `SELECT id, game, bet_total, payout, result, created_at
     FROM game_rounds
     WHERE ${where}
     ORDER BY id DESC
     LIMIT 30`, params
  )
  return json(res, 200, { ok:true, items: q.rows })
}