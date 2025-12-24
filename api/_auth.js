const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { ensureSchema, getPool } = require('../api/_db.js')
const { json, readJson, getBearerToken, requireEnv } = require('../api/_utils.js')

function signToken(user){
  const secret = requireEnv('JWT_SECRET')
  return jwt.sign({ uid: user.id, role: user.role }, secret, { expiresIn: '30d' })
}

async function getAuthUser(req){
  const token = getBearerToken(req)
  if(!token) return null
  const secret = requireEnv('JWT_SECRET')
  try{
    const payload = jwt.verify(token, secret)
    return payload
  }catch{
    return null
  }
}

module.exports = async function handler(req, res){
  json(res, 404, { ok:false, message: 'Not found' })
}