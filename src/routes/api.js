const { Router } = require('express')
const sfCliService = require('../services/sfCliService')
const { DEFAULT_SOQL_LIMIT, MAX_SOQL_LIMIT } = require('../../config/constants')

const router = Router()

router.get('/orgs', async (req, res, next) => {
  try {
    const { orgs } = await sfCliService.listOrgs()
    res.json({ orgs })
  } catch (err) {
    err.statusCode = 500
    next(err)
  }
})

router.get('/batch-jobs', async (req, res, next) => {
  const targetOrg = req.query.targetOrg
  if (!targetOrg || typeof targetOrg !== 'string' || !targetOrg.trim()) {
    return res.status(400).json({ error: 'targetOrg is required' })
  }
  if (!sfCliService.validateTargetOrg(targetOrg)) {
    return res.status(400).json({ error: 'Invalid targetOrg' })
  }
  const jobId = req.query.jobId && typeof req.query.jobId === 'string' ? req.query.jobId.trim() : undefined
  const search = req.query.search && typeof req.query.search === 'string' ? req.query.search.trim() : undefined
  let statuses = req.query.statuses
  if (statuses !== undefined && statuses !== null) {
    if (typeof statuses === 'string') {
      statuses = statuses.split(',').map(s => s.trim()).filter(Boolean)
    } else if (Array.isArray(statuses)) {
      statuses = statuses.map(s => String(s).trim()).filter(Boolean)
    } else {
      statuses = undefined
    }
  } else {
    statuses = undefined
  }
  let limit = req.query.limit
  if (limit !== undefined && limit !== null) {
    const n = parseInt(String(limit).trim(), 10)
    if (!Number.isFinite(n) || n < 1 || n > MAX_SOQL_LIMIT) {
      return res.status(400).json({ error: 'limit must be between 1 and ' + MAX_SOQL_LIMIT })
    }
    limit = n
  } else {
    limit = DEFAULT_SOQL_LIMIT
  }
  const options = { jobId: jobId || undefined, apexClassNameSearch: search || undefined, statuses, limit }
  try {
    const jobs = await sfCliService.getBatchJobs(targetOrg, options)
    res.json({ jobs })
  } catch (err) {
    err.statusCode = 500
    next(err)
  }
})

module.exports = router
