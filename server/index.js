const express = require('express')
const cors = require('cors')

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/v1/accounts', require('./routes/auth'))
app.use('/api/v1/games/dice/game', require('./routes/games/dice'))
app.use('/api/v1/games/roulette/game', require('./routes/games/roulette'))
app.use('/api/v1/games/mines/game', require('./routes/games/mines'))
app.use('/api/v1/games/plinko/game', require('./routes/games/plinko'))
app.use('/api/v1/games/cases', require('./routes/games/cases'))
app.use('/api/v1/battles', require('./routes/battles'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
