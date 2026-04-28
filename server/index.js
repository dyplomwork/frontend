
const express=require('express')
const cors=require('cors')
const app=express()
app.use(cors())
app.use(express.json())

let user={id:1,username:'test',balance:1000}
app.post('/auth/login',(req,res)=>res.json({token:'fake',user}))
app.post('/auth/register',(req,res)=>res.json({token:'fake',user}))

app.get('/user',(req,res)=>res.json(user))

app.post('/games/dice',(req,res)=>res.json({win:true,profit:10,balance:user.balance+=10}))
app.post('/games/mines',(req,res)=>res.json({result:'continue'}))
app.post('/games/plinko',(req,res)=>res.json({multiplier:2}))
app.post('/games/roulette',(req,res)=>res.json({win:false}))
app.post('/games/coinflip',(req,res)=>res.json({win:true}))

app.get('/cases',(req,res)=>res.json([]))
app.post('/cases/open',(req,res)=>res.json({items:[]}))

app.get('/battles',(req,res)=>res.json([]))

app.listen(3000,()=>console.log('server running'))
