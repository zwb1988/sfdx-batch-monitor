const constants = require('../../../../config/constants')
const { requestHttp1, parseJsonBody, formatRemoteError } = require('../http1')

function normalizeLoginUrl (raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) {
    const err = new Error('Salesforce domain is required')
    err.statusCode = 400
    throw err
  }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value)
  } catch (_) {
    const err = new Error('Enter a valid Salesforce domain')
    err.statusCode = 400
    throw err
  }
  if (url.protocol !== 'https:') {
    const err = new Error('Salesforce domain must use HTTPS')
    err.statusCode = 400
    throw err
  }
  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'salesforce.com' && !hostname.endsWith('.salesforce.com')) {
    const err = new Error('Salesforce domain must be hosted on salesforce.com')
    err.statusCode = 400
    throw err
  }
  if (url.username || url.password || url.search || url.hash) {
    const err = new Error('Salesforce domain must not contain credentials, query parameters, or fragments')
    err.statusCode = 400
    throw err
  }
  return url.origin
}

async function postForm (url, fields, fallbackError) {
  const form = new URLSearchParams(fields).toString()
  const response = await requestHttp1({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form)
    },
    body: form,
    timeoutMs: constants.DATA_CLOUD_HTTP_TIMEOUT_MS
  })
  const parsed = parseJsonBody(response.body)
  if (response.status < 200 || response.status >= 300) {
    const err = new Error(formatRemoteError(response.status, parsed, fallbackError))
    err.statusCode = response.status >= 400 && response.status < 500 ? 401 : 502
    throw err
  }
  return parsed
}

async function getCredentials ({ loginUrl, clientId, clientSecret }) {
  const normalizedLoginUrl = normalizeLoginUrl(loginUrl)
  const id = typeof clientId === 'string' ? clientId.trim() : ''
  const secret = typeof clientSecret === 'string' ? clientSecret : ''
  if (!id || !secret) {
    const err = new Error('Client ID and client secret are required')
    err.statusCode = 400
    throw err
  }

  const core = await postForm(
    normalizedLoginUrl + '/services/oauth2/token',
    {
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret
    },
    'Salesforce client-credentials authorization failed'
  )
  const sfAccessToken = core && (core.access_token || core.accessToken)
  const sfInstanceUrl = normalizeLoginUrl(core && (core.instance_url || core.instanceUrl))
  if (!sfAccessToken || !sfInstanceUrl) {
    throw new Error('Salesforce authorization did not return an access token and instance URL')
  }

  const dataCloud = await postForm(
    sfInstanceUrl + '/services/a360/token',
    {
      grant_type: 'urn:salesforce:grant-type:external:cdp',
      subject_token: sfAccessToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token'
    },
    'Data Cloud token exchange failed'
  )
  const dcAccessToken = dataCloud && (dataCloud.access_token || dataCloud.accessToken)
  const dcInstanceUrl = normalizeLoginUrl(dataCloud && (dataCloud.instance_url || dataCloud.instanceUrl))
  if (!dcAccessToken || !dcInstanceUrl) {
    throw new Error('Data Cloud authorization did not return an access token and instance URL')
  }

  const expiresIn = Number(dataCloud.expires_in)
  const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0
    ? expiresIn * 1000
    : 60 * 60 * 1000

  return {
    authMethod: 'client-credentials',
    sfInstanceUrl,
    sfAccessToken,
    dcInstanceUrl,
    dcAccessToken,
    expiresAt: Date.now() + ttlMs
  }
}

module.exports = { getCredentials }
