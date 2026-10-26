/**
 * The browser channel for this plugin: the 项目目录 tab and the EZUSE settings
 * page both ride it.
 *
 * The Client half of a profile-installed plugin has no generated Remote
 * namespace, so this plugin carries its own routes on the Harness' web server —
 * the same process that owns the state:
 *
 *   GET  /ezuse/roots?session=<id>   → the mounted directory state
 *   GET  /ezuse/session?session=<id> → title, workspace and mode of one session
 *   GET  /ezuse/workspaces         → every registered workspace with its roots
 *   POST /ezuse/roots accepts `workspace: <path>` in place of `session`
 *   POST /ezuse/roots                → add / remove / clear, then the same state
 *   GET  /ezuse/config               → the plugin's settings
 *   POST /ezuse/config               → merge a partial settings patch
 *
 * Mutations require the `x-dsh-ezuse: 1` header, which only same-origin script
 * can set (a cross-origin form post cannot), and a cross-site `Origin` or
 * `Sec-Fetch-Site: cross-site` request is refused. This is a local convenience
 * surface, not an authenticated API: the server binds loopback and carries no
 * auth of its own.
 */
import { Buffer } from 'node:buffer'

const ROOTS_PATH = '/ezuse/roots'
const SESSION_PATH = '/ezuse/session'
const WORKSPACES_PATH = '/ezuse/workspaces'
const CONFIG_PATH = '/ezuse/config'
const MAX_BODY_BYTES = 64 * 1024

/** Write one JSON response. */
function respond(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/** Read a bounded JSON body. */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object') throw new Error('request body must be a JSON object')
  return parsed
}

/** Whether a mutating request comes from this page rather than a drive-by one. */
function admitsMutation(req) {
  if (req.headers['x-dsh-ezuse'] !== '1') return false
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0 && origin !== 'null') {
    const host = req.headers.host
    if (typeof host !== 'string' || host.length === 0) return false
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/**
 * Register this plugin's routes for as long as the plugin is loaded.
 * @param {object} ctx - host context; `webServer` serves the routes.
 * @param {{
 *   describe: (sessionId: string) => Promise<object>,
 *   describeSession: (sessionId: string) => object,
 *   mutate: (sessionId: string, action: string, path: unknown) => Promise<object>,
 *   readConfig: () => object,
 *   writeConfig: (patch: unknown) => object,
 * }} api - the plugin's operations.
 * @returns {() => void} disposer removing the routes.
 */
export function installRoutes(ctx, api) {
  const webServer = ctx.webServer
  if (webServer === undefined || typeof webServer.register !== 'function') return () => {}

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url ?? ROOTS_PATH, 'http://127.0.0.1')
      const mutating = req.method === 'POST'
      if (mutating && !admitsMutation(req)) {
        respond(res, 403, { ok: false, error: 'forbidden' })
        return
      }

      if (url.pathname === CONFIG_PATH) {
        if (req.method === 'GET') {
          respond(res, 200, { ok: true, config: api.readConfig() })
          return
        }
        if (mutating) {
          const body = await readJson(req)
          respond(res, 200, { ok: true, config: api.writeConfig(body) })
          return
        }
        respond(res, 405, { ok: false, error: `method not allowed: ${req.method ?? 'unknown'}` })
        return
      }

      if (url.pathname === WORKSPACES_PATH && req.method === 'GET') {
        respond(res, 200, await api.workspaces())
        return
      }

      if (url.pathname === SESSION_PATH) {
        if (req.method === 'GET') {
          respond(res, 200, api.describeSession(url.searchParams.get('session') ?? ''))
          return
        }
        respond(res, 405, { ok: false, error: `method not allowed: ${req.method ?? 'unknown'}` })
        return
      }

      if (url.pathname === ROOTS_PATH) {
        if (req.method === 'GET') {
          const session = url.searchParams.get('session') ?? ''
          respond(res, 200, await api.describe(session))
          return
        }
        if (mutating) {
          const body = await readJson(req)
          const action = typeof body.action === 'string' ? body.action : ''
          if (typeof body.workspace === 'string' && body.workspace.length > 0) {
            respond(res, 200, await api.mutateByWorkspace(body.workspace, action, body.path))
            return
          }
          const session = typeof body.session === 'string' ? body.session : ''
          respond(res, 200, await api.mutate(session, action, body.path))
          return
        }
        respond(res, 405, { ok: false, error: `method not allowed: ${req.method ?? 'unknown'}` })
        return
      }

      respond(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      respond(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const disposers = [
    webServer.register({ kind: 'exact', path: ROOTS_PATH, handler }),
    webServer.register({ kind: 'exact', path: CONFIG_PATH, handler }),
    webServer.register({ kind: 'exact', path: SESSION_PATH, handler }),
    webServer.register({ kind: 'exact', path: WORKSPACES_PATH, handler }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export { ROOTS_PATH, CONFIG_PATH, SESSION_PATH, WORKSPACES_PATH }
