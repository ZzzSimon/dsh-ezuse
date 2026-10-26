/**
 * Checks for the browser channel: the two routes the 项目目录 tab calls, the
 * session → workspace lookup, and the mutation guard that keeps a cross-site
 * request from mounting a directory.
 *
 * Run: node test/http.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalPath } from '../lib/paths.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '.scratch-http')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(join(scratch, 'home'), { recursive: true })
mkdirSync(join(scratch, 'primary'), { recursive: true })
mkdirSync(join(scratch, 'extra'), { recursive: true })
process.env.DSH_HOME = join(scratch, 'home')

const primary = canonicalPath(join(scratch, 'primary'))
const extra = canonicalPath(join(scratch, 'extra'))
const SESSION = 'session-test'

const plugin = await import('../index.js')
const { describeWorkspace, mutateWorkspace, describeSession, describeWorkspaces, mutateByWorkspace } = plugin
const { installRoutes } = await import('../lib/http.js')

// ---- mock host ------------------------------------------------------------
const fsService = {
  async writeText() {
    return { version: 'v1' }
  },
  async editText() {
    return { version: 'v2' }
  },
}

const routes = new Map()
const warnings = []
const ctx = {
  logger: { warn: (message) => warnings.push(message), info: () => {}, error: () => {} },
  get(name) {
    if (name === 'fs') return fsService
    if (name === 'sessionTitle') return { get: () => ({ title: '多工作区插件开发' }) }
    if (name === 'workspaceRegistry') return { list: () => [{ id: 'w1', title: '主仓库', path: primary }] }
    if (name === 'agents') {
      return {
        get: (id) =>
          id === SESSION ? { id, session: { header: { cwd: primary } } } : undefined,
      }
    }
    return undefined
  },
  effect(fn) {
    const cleanup = fn()
    return cleanup
  },
  on: () => () => {},
  inject(names, callback) {
    callback({
      fs: fsService,
      systemPrompt: { context: () => () => {} },
      effect: ctx.effect,
      get: ctx.get,
      logger: ctx.logger,
    })
  },
  commands: { register: () => () => {} },
}

const service = {
  store: null,
  rootsOf: () => [],
  grants: { status: () => ({ supported: true, granted: 0 }) },
  state: () => ({ fence: true, grants: { supported: true, granted: 0 } }),
  apply: () => {},
}
// The real store, so the routes exercise the same record the command writes.
const { RootsStore, resolveStoreFile } = await import('../lib/store.js')
service.store = new RootsStore({ file: resolveStoreFile() })
service.rootsOf = (workspaceRoot) => service.store.list(workspaceRoot)

const webServer = {
  register: (route) => {
    routes.set(route.path, route)
    return () => {
      routes.delete(route.path)
    }
  },
}

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ---- routes --------------------------------------------------------------
const { ConfigStore } = await import('../lib/config.js')
const config = new ConfigStore({ file: join(scratch, 'config.json') })
const dispose = installRoutes({ webServer }, {
  describe: (sessionId) => describeWorkspace(ctx, service, sessionId),
  mutate: (sessionId, action, path) => mutateWorkspace(ctx, service, sessionId, action, path),
  readConfig: () => config.get(),
  writeConfig: (patch) => config.set(patch),
  describeSession: (sessionId) => describeSession(ctx, sessionId),
  workspaces: () => describeWorkspaces(ctx, service),
  mutateByWorkspace: (workspacePath, action, path) => mutateByWorkspace(ctx, service, workspacePath, action, path),
})

/** One request against the registered route for `url`'s pathname. */
async function request({ method = 'GET', url = '/ezuse/roots', headers = {}, body } = {}) {
  const result = { status: null, payload: null }
  const route = routes.get(new URL(url, 'http://127.0.0.1').pathname)
  if (route === undefined) throw new Error(`no route for ${url}`)
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
    },
  }
  const res = {
    writeHead: (status) => {
      result.status = status
    },
    end: (chunk) => {
      result.payload = chunk === undefined ? null : JSON.parse(String(chunk))
    },
  }
  await route.handler(req, res)
  return result
}

await check('all routes register as exact pathnames', () => {
  assert.deepEqual([...routes.keys()].sort(), ['/ezuse/config', '/ezuse/roots', '/ezuse/session', '/ezuse/workspaces'])
  for (const route of routes.values()) assert.equal(route.kind, 'exact')
})

await check('GET reports the primary workspace and no extra roots', async () => {
  const { status, payload } = await request({ url: `/ezuse/roots?session=${SESSION}` })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.primary, primary)
  assert.deepEqual(payload.roots, [])
  assert.equal(payload.fence, true)
})

await check('GET for an unknown session fails with a reason instead of throwing', async () => {
  const { status, payload } = await request({ url: '/ezuse/roots?session=missing' })
  assert.equal(status, 200)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /会话未在运行/)
})

await check('POST without the plugin header is refused', async () => {
  const { status, payload } = await request({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { session: SESSION, action: 'add', path: extra },
  })
  assert.equal(status, 403)
  assert.equal(payload.ok, false)
  assert.deepEqual(service.rootsOf(primary), [])
})

await check('POST from another origin is refused even with the header', async () => {
  const { status } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1', origin: 'http://evil.example', host: '127.0.0.1:3080' },
    body: { session: SESSION, action: 'add', path: extra },
  })
  assert.equal(status, 403)
})

await check('POST with the header and same origin mounts the directory', async () => {
  const { status, payload } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1', origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' },
    body: { session: SESSION, action: 'add', path: extra },
  })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.added, true)
  assert.deepEqual(payload.roots, [{ path: extra, exists: true }])
  assert.deepEqual(service.rootsOf(primary), [extra])
})

await check('adding a missing directory reports the reason', async () => {
  const { payload } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1' },
    body: { session: SESSION, action: 'add', path: join(scratch, 'nope') },
  })
  assert.equal(payload.ok, false)
  assert.match(payload.error, /目录不存在/)
})

await check('removing the directory drops it again', async () => {
  const { payload } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1' },
    body: { session: SESSION, action: 'remove', path: extra },
  })
  assert.equal(payload.ok, true)
  assert.equal(payload.removed, true)
  assert.deepEqual(payload.roots, [])
})

await check('clear reports how many it removed', async () => {
  await mutateWorkspace(ctx, service, SESSION, 'add', extra)
  const { payload } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1' },
    body: { session: SESSION, action: 'clear' },
  })
  assert.equal(payload.ok, true)
  assert.equal(payload.cleared, 1)
})

await check('an unknown action and an unknown method are rejected cleanly', async () => {
  const unknown = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1' },
    body: { session: SESSION, action: 'explode' },
  })
  assert.equal(unknown.payload.ok, false)
  const method = await request({ method: 'DELETE', headers: {} })
  assert.equal(method.status, 405)
})

await check('a malformed body is answered with 400, never an exception', async () => {
  const result = { status: null, payload: null }
  const req = {
    method: 'POST',
    url: '/ezuse/roots',
    headers: { 'x-dsh-ezuse': '1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{not json', 'utf8')
    },
  }
  await routes.get('/ezuse/roots').handler(req, {
    writeHead: (status) => {
      result.status = status
    },
    end: (chunk) => {
      result.payload = JSON.parse(String(chunk))
    },
  })
  assert.equal(result.status, 400)
  assert.equal(result.payload.ok, false)
})

await check('GET /ezuse/config answers the defaults', async () => {
  const { status, payload } = await request({ url: '/ezuse/config' })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.config.notifications.enabled, true)
  assert.equal(payload.config.notifications.onlyWhenHidden, true)
})

await check('POST /ezuse/config without the plugin header is refused', async () => {
  const { status } = await request({ method: 'POST', url: '/ezuse/config', body: { notifications: { enabled: false } } })
  assert.equal(status, 403)
})

await check('POST /ezuse/config merges a patch and persists it', async () => {
  const { status, payload } = await request({
    method: 'POST',
    url: '/ezuse/config',
    headers: { 'x-dsh-ezuse': '1' },
    body: { notifications: { enabled: false } },
  })
  assert.equal(status, 200)
  assert.equal(payload.config.notifications.enabled, false)
  assert.equal(payload.config.notifications.onlyWhenHidden, true, 'the other field is preserved')
  assert.equal(config.get().notifications.enabled, false)
})

await check('GET /ezuse/session names the session for a notification', async () => {
  const { status, payload } = await request({ url: `/ezuse/session?session=${SESSION}` })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.title, '多工作区插件开发')
  assert.equal(payload.workspace, 'primary')
  assert.equal(payload.primary, primary)
})

await check('GET /ezuse/session for an unknown session fails softly', async () => {
  const { payload } = await request({ url: '/ezuse/session?session=missing' })
  assert.equal(payload.ok, false)
  assert.match(payload.error, /会话未在运行/)
})

await check('GET /ezuse/workspaces lists every workspace with its roots', async () => {
  const { status, payload } = await request({ url: '/ezuse/workspaces' })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.workspaces.length, 1)
  assert.equal(payload.workspaces[0].title, '主仓库')
  assert.equal(payload.workspaces[0].path, primary)
  assert.deepEqual(
    payload.workspaces[0].roots,
    service.rootsOf(primary).map((root) => ({ path: root, exists: true })),
  )
})

await check('a workspace-addressed POST mounts without a session', async () => {
  const { status, payload } = await request({
    method: 'POST',
    headers: { 'x-dsh-ezuse': '1' },
    body: { workspace: primary, action: 'add', path: extra },
  })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.added, true)
  assert.deepEqual(service.rootsOf(primary), [extra])
  const listed = await request({ url: '/ezuse/workspaces' })
  assert.ok(listed.payload.workspaces[0].roots.some((root) => root.path === extra && root.exists === true))
})

await check('an unknown pathname reaching the handler is answered with 404', async () => {
  const result = { status: null, payload: null }
  const req = { method: 'GET', url: '/ezuse/nope', headers: {}, async *[Symbol.asyncIterator]() {} }
  await routes.get('/ezuse/roots').handler(req, {
    writeHead: (status) => {
      result.status = status
    },
    end: (chunk) => {
      result.payload = JSON.parse(String(chunk))
    },
  })
  assert.equal(result.status, 404)
  assert.equal(result.payload.ok, false)
})

await check('the disposer removes every route', () => {
  dispose()
  assert.equal(routes.size, 0)
})

rmSync(scratch, { recursive: true, force: true })
if (warnings.length > 0) console.log(`warnings: ${warnings.join(' | ')}`)
console.log(`\n${passed} checks passed`)
