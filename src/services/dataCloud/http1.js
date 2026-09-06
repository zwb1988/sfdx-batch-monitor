const https = require('https')
const http = require('http')
const { URL } = require('url')

function requestHttp1 (options) {
  const {
    url,
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 180000
  } = options
  const u = new URL(url)
  const transport = u.protocol === 'http:' ? http : https
  const isStream = body && typeof body.pipe === 'function'

  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method,
      headers
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => { chunks.push(chunk) })
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks)
        })
      })
    })
    req.on('error', reject)
    if (timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('Request timed out'))
      })
    }
    if (isStream) {
      body.on('error', (err) => {
        req.destroy(err)
      })
      body.pipe(req)
      return
    }
    if (body != null) req.write(body)
    req.end()
  })
}

function parseJsonBody (buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '')
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (_) {
    return { raw: trimmed.slice(0, 400) }
  }
}

function pushErrorPart (parts, value) {
  if (typeof value !== 'string') return
  const text = value.trim()
  if (!text || parts.includes(text)) return
  parts.push(text)
}

/**
 * Pulls user-visible error text from Salesforce / Data Cloud JSON payloads,
 * including OAuth errors, REST error arrays, and job errorMessage fields.
 */
function collectJsonErrorText (parsed) {
  if (parsed == null) return null
  if (typeof parsed === 'string') {
    const text = parsed.trim()
    return text || null
  }
  if (Array.isArray(parsed)) {
    const parts = []
    for (const item of parsed) {
      pushErrorPart(parts, collectJsonErrorText(item))
    }
    return parts.length ? parts.join('; ') : null
  }
  if (typeof parsed !== 'object') return null

  const parts = []
  const errorCode = parsed.errorCode || parsed.error_code
  if (typeof errorCode === 'string') pushErrorPart(parts, errorCode)

  if (typeof parsed.error === 'string') {
    pushErrorPart(parts, parsed.error)
  } else if (parsed.error && typeof parsed.error === 'object') {
    pushErrorPart(parts, collectJsonErrorText(parsed.error))
  }

  pushErrorPart(parts, parsed.error_description)
  pushErrorPart(parts, parsed.errorMessage)
  pushErrorPart(parts, parsed.error_message)
  pushErrorPart(parts, parsed.message)
  pushErrorPart(parts, parsed.exceptionMessage)
  if (parsed.errors != null) pushErrorPart(parts, collectJsonErrorText(parsed.errors))
  return parts.length ? parts.join(' — ') : null
}

function formatRemoteError (status, parsed, fallback) {
  const fromJson = collectJsonErrorText(parsed)
  if (fromJson) return fromJson
  if (parsed && typeof parsed === 'object' && typeof parsed.raw === 'string' && parsed.raw.trim()) {
    return parsed.raw.trim()
  }
  return fallback + ' (HTTP ' + status + ')'
}

module.exports = {
  requestHttp1,
  parseJsonBody,
  collectJsonErrorText,
  formatRemoteError
}
