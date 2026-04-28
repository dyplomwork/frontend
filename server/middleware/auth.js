const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../utils/constants')

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ message: 'Unauthorized' })

  const token = header.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Unauthorized' })

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(403).json({ message: 'Forbidden' })
  }
}
