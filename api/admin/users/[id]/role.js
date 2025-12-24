const { ensureSchema, getPool } = require('../../../_db.js')
const { json, readJson } = require('../../../_utils.js')
const { requireAdmin } = require('../../_guard.js')

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return json(res, 405, { ok:false, message:'Method not allowed' })
  const admin = requireAdmin(req, res)
  if(!admin) return
  await ensureSchema()

  const m = new URL(req.url, `http://${req.headers.host}`).pathname.match(/\/api\/admin\/users\/(.+?)\/role/)
  const id = (req.query?.id || req.params?.id || (m ? m[1] : null))
  if(!id) return json(res, 400, { ok:false, message:'Bad id' })

  const body = await readJson(req)
  const role = String(body.role || '')
  if(role !== 'user' && role !== 'admin') return json(res, 400, { ok:false, message:'Bad role' })

  const pool = getPool()
  await pool.query(`UPDATE users SET role=$2 WHERE id=$1`, [id, role])
  return json(res, 200, { ok:true })
}