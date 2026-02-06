const path = require('path')
const express = require('express')
const apiRoutes = require('./src/routes/api')
const { errorHandler } = require('./src/middleware/errorHandler')
const { PORT } = require('./config/constants')

const app = express()
app.use(express.static(path.join(__dirname, 'public')))
app.use('/api', apiRoutes)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Salesforce Batch Monitor listening on http://localhost:${PORT}`)
})
