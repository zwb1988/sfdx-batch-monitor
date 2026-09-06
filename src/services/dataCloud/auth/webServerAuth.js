/**
 * Placeholder for OAuth 2.0 web-server flow (authorization code).
 * Intentionally unimplemented so the auth registry can grow without
 * changing ingest callers.
 */
async function getCredentials (_targetOrg) {
  const err = new Error(
    'Web-server OAuth is not implemented yet. Use client-credentials authentication.'
  )
  err.statusCode = 501
  throw err
}

module.exports = { getCredentials }
