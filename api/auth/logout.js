const { json } = require('../_utils.js')
module.exports = async function handler(req, res){
  // Front хранит токен в localStorage, так что logout — просто заглушка для совместимости
  return json(res, 200, { ok:true })
}