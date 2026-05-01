import express from 'express'
import cors from 'cors'
import apiRouter from './routes/api'
import browserRouter from './routes/browser'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api', apiRouter)
app.use('/browser', browserRouter)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
