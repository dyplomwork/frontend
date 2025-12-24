const { randomBytes, timingSafeEqual } = require('crypto')

function json(res, status, data){
  res.statusCode = status
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function readJson(req){
  if(req.method === 'GET' || req.method === 'HEAD') return {}
  const chunks=[]
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if(!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function getBearerToken(req){
  const h = req.headers['authorization'] || req.headers['Authorization']
  if(!h || typeof h !== 'string') return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function requireEnv(name){
  const v = process.env[name]
  if(!v) throw new Error(`Missing env: ${name}`)
  return v
}

function rndId(bytes = 16){
  return randomBytes(bytes).toString('hex')
}

function round2(n){
  return Math.round(Number(n) * 100) / 100
}

module.exports = { json, getBearerToken, requireEnv, rndId, round2 }
