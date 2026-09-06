const crypto = require('crypto')
const clientCredentialsAuth = require('./clientCredentialsAuth')

/** Expire sessions two minutes before their Data Cloud token does. */
const EXPIRY_SKEW_MS = 2 * 60 * 1000
const sessions = new Map()

async function connect (credentials) {
  const session = await clientCredentialsAuth.getCredentials(credentials)
  const connectionId = crypto.randomUUID()
  sessions.set(connectionId, session)
  return {
    connectionId,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
}

function getSession (connectionId) {
  const id = typeof connectionId === 'string' ? connectionId.trim() : ''
  const session = sessions.get(id)
  if (!session || session.expiresAt - EXPIRY_SKEW_MS <= Date.now()) {
    if (id) sessions.delete(id)
    const err = new Error('Data Cloud connection is missing or expired. Connect again.')
    err.statusCode = 401
    throw err
  }
  return session
}

function disconnect (connectionId) {
  const id = typeof connectionId === 'string' ? connectionId.trim() : ''
  if (id) sessions.delete(id)
}

module.exports = { connect, getSession, disconnect }
