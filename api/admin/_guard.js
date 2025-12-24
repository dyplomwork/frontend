const jwt = require('jsonwebtoken')
const { json, getBearerToken, requireEnv } = require('../_utils.js')

function requireAdmin(req, res){
  const token = getBearerToken(req)
  if(!token){ json(res, 401, { ok:false, message:'Unauthorized' }); return null }
  let payload
  try{ payload = jwt.verify(token, requireEnv('JWT_SECRET')) }catch{ json(res, 401, { ok:false, message:'Unauthorized' }); return null }
  if(payload.role !== 'admin'){ json(res, 403, { ok:false, message:'Forbidden' }); return null }
  return payload
}

module.exports = { requireAdmin }
