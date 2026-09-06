const fs = require('fs')
const os = require('os')
const path = require('path')
const { Router } = require('express')
const multer = require('multer')
const constants = require('../../config/constants')
const { connect, disconnect, getSession } = require('../services/dataCloud/auth')
const { listIngestConnectors, listIngestObjects } = require('../services/dataCloud/connectApi')
const ingestApi = require('../services/dataCloud/ingestApi')

const router = Router()

const JOB_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]{0,79}$/
const OPERATIONS = new Set(['upsert', 'delete'])

const upload = multer({
  dest: path.join(os.tmpdir(), 'sfdx-dc-ingest'),
  limits: {
    fileSize: constants.DATA_CLOUD_MAX_CSV_BYTES,
    files: constants.DATA_CLOUD_MAX_CSV_FILES
  }
})

function sessionFromReq (req) {
  return getSession(req.query.connectionId)
}

function validateName (value, label) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s || !NAME_REGEX.test(s)) {
    const err = new Error('Invalid ' + label)
    err.statusCode = 400
    throw err
  }
  return s
}

function validateJobId (value) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!JOB_ID_REGEX.test(s)) {
    const err = new Error('Invalid job id')
    err.statusCode = 400
    throw err
  }
  return s
}

function validateOperation (value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!OPERATIONS.has(s)) {
    const err = new Error('operation must be upsert or delete')
    err.statusCode = 400
    throw err
  }
  return s
}

function cleanupFiles (files) {
  for (const file of files || []) {
    if (!file || !file.path) continue
    try { fs.unlinkSync(file.path) } catch (_) {}
  }
}

function ensureUploadDir () {
  const dir = path.join(os.tmpdir(), 'sfdx-dc-ingest')
  fs.mkdirSync(dir, { recursive: true })
}

ensureUploadDir()

router.post('/data-cloud/connect', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const result = await connect({
      loginUrl: body.loginUrl,
      clientId: body.clientId,
      clientSecret: body.clientSecret
    })
    res.json({ connected: true, ...result })
  } catch (err) {
    next(err)
  }
})

router.delete('/data-cloud/connect', (req, res) => {
  disconnect(req.query.connectionId)
  res.json({ connected: false })
})

router.get('/data-cloud/ingest-connectors', async (req, res, next) => {
  try {
    const session = sessionFromReq(req)
    const connectors = await listIngestConnectors(session)
    res.json({ connectors })
  } catch (err) {
    next(err)
  }
})

router.get('/data-cloud/ingest-objects', async (req, res, next) => {
  try {
    const sourceName = validateName(req.query.sourceName, 'sourceName')
    const connectorId = typeof req.query.connectorId === 'string' ? req.query.connectorId.trim() : ''
    const connectionName = typeof req.query.connectionName === 'string' ? req.query.connectionName.trim() : ''
    const session = sessionFromReq(req)
    const objects = await listIngestObjects(session, sourceName, connectorId, connectionName)
    res.json({ objects })
  } catch (err) {
    next(err)
  }
})

router.get('/data-cloud/ingest-jobs', async (req, res, next) => {
  try {
    const session = sessionFromReq(req)
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : ''
    if (jobId) {
      const job = await ingestApi.getIngestJob(session, validateJobId(jobId))
      return res.json({ job })
    }
    const jobs = await ingestApi.listIngestJobs(session)
    res.json({ jobs })
  } catch (err) {
    next(err)
  }
})

router.post('/data-cloud/ingest-jobs', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const sourceName = validateName(body.sourceName, 'sourceName')
    const objectName = validateName(body.object, 'object')
    const operation = validateOperation(body.operation)
    const session = sessionFromReq(req)
    const job = await ingestApi.createIngestJob(session, { sourceName, objectName, operation })
    res.status(201).json({ job })
  } catch (err) {
    next(err)
  }
})

router.put('/data-cloud/ingest-jobs/:jobId/batches', (req, res, next) => {
  upload.array('files', constants.DATA_CLOUD_MAX_CSV_FILES)(req, res, (multerErr) => {
    if (multerErr) {
      multerErr.statusCode = 400
      return next(multerErr)
    }
    next()
  })
}, async (req, res, next) => {
  const files = req.files || []
  try {
    if (!files.length) {
      const err = new Error('At least one CSV file is required')
      err.statusCode = 400
      throw err
    }
    const jobId = validateJobId(req.params.jobId)
    const session = sessionFromReq(req)
    const uploaded = []
    for (const file of files) {
      await ingestApi.uploadCsvBatch(session, jobId, file.path)
      uploaded.push({
        originalName: file.originalname || file.filename,
        bytes: file.size
      })
    }
    res.json({ accepted: true, uploaded })
  } catch (err) {
    next(err)
  } finally {
    cleanupFiles(files)
  }
})

router.patch('/data-cloud/ingest-jobs/:jobId', async (req, res, next) => {
  try {
    const jobId = validateJobId(req.params.jobId)
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const state = typeof body.state === 'string' ? body.state.trim() : ''
    if (state !== 'UploadComplete') {
      const err = new Error('Only state UploadComplete is supported')
      err.statusCode = 400
      throw err
    }
    const session = sessionFromReq(req)
    const job = await ingestApi.completeIngestJob(session, jobId)
    res.json({ job })
  } catch (err) {
    next(err)
  }
})

module.exports = router
