/**
 * Checks the permission-mode gate: an extra-root shell grant is only written
 * where it can decide anything (`workspace-write`). In `read-only` the confined
 * token carries no write SID, and under `danger-full-access` the shell is
 * unrestricted — writing ACEs there costs a full tree walk (a minute on a
 * 900k-object repository) for no effect.
 *
 * Run: node test/mode-gate.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalPath } from '../lib/paths.js'
import { RootsStore } from '../lib/store.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '.scratch-mode')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(join(scratch, 'primary'), { recursive: true })
mkdirSync(join(scratch, 'extra'), { recursive: true })

const primary = canonicalPath(join(scratch, 'primary'))
const extra = canonicalPath(join(scratch, 'extra'))
const SESSION = 'session-mode'

const { describeWorkspace, mutateWorkspace } = await import('../index.js')

/** The mode the fake policy resolves, flipped by the test. */
let mode = 'danger-full-access'

const ctx = {
  logger: { warn: () => {}, info: () => {}, error: () => {} },
  get(name) {
    if (name === 'agents') {
      return { get: (id) => (id === SESSION ? { id, session: { header: { cwd: primary } } } : undefined) }
    }
    if (name === 'sandboxPolicy') {
      return { resolve: () => ({ mode, workspaceRoot: primary }) }
    }
    if (name === 'fs') {
      return { writeText: async () => ({}), editText: async () => ({}) }
    }
    return undefined
  },
}

/** Record every grant request the plugin makes. */
const applyCalls = []
const service = {
  store: new RootsStore({ file: join(scratch, 'state', 'roots.json') }),
  rootsOf(workspaceRoot) {
    return this.store.list(workspaceRoot)
  },
  state: () => ({ fence: true, grants: { supported: true, granted: applyCalls.length, pending: false } }),
  apply(workspaceRoot, roots, options) {
    applyCalls.push({ workspaceRoot, roots: [...roots], options: options ?? {} })
    return Promise.resolve()
  },
}

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

await check('danger-full-access: reading the tab asks for no grant', async () => {
  mode = 'danger-full-access'
  const snapshot = await describeWorkspace(ctx, service, SESSION)
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.mode, 'danger-full-access')
  assert.deepEqual(applyCalls.map((call) => call.options), [{ grant: false }], 'the manager is told not to grant')
})

await check('danger-full-access: mounting records the root but grants nothing', async () => {
  applyCalls.length = 0
  const result = await mutateWorkspace(ctx, service, SESSION, 'add', extra)
  assert.equal(result.ok, true)
  assert.equal(result.added, true)
  assert.deepEqual(service.rootsOf(primary), [extra], 'the record still has it')
  assert.ok(applyCalls.length > 0, 'the manager is told to reconcile')
  assert.ok(applyCalls.every((call) => call.options.grant === false), 'but never to grant')
})

await check('switching to workspace-write makes the very next read grant it', async () => {
  applyCalls.length = 0
  mode = 'workspace-write'
  const snapshot = await describeWorkspace(ctx, service, SESSION)
  assert.equal(snapshot.mode, 'workspace-write')
  assert.equal(applyCalls.length, 1, 'the read re-states the grant')
  assert.deepEqual(applyCalls[0].options, { grant: true })
  assert.deepEqual(applyCalls[0].roots, [extra])
})

await check('workspace-write: mounting grants it', async () => {
  applyCalls.length = 0
  await mutateWorkspace(ctx, service, SESSION, 'remove', extra)
  await mutateWorkspace(ctx, service, SESSION, 'add', extra)
  assert.ok(applyCalls.length > 0)
  assert.ok(applyCalls.every((call) => call.options.grant === true), 'every reconcile asked for the grant')
  assert.ok(applyCalls.some((call) => call.roots.length === 1 && call.roots[0] === extra))
})

await check('read-only: no grant is written either', async () => {
  applyCalls.length = 0
  mode = 'read-only'
  const snapshot = await describeWorkspace(ctx, service, SESSION)
  assert.equal(snapshot.mode, 'read-only')
  assert.deepEqual(applyCalls.map((call) => call.options), [{ grant: false }])
  await mutateWorkspace(ctx, service, SESSION, 'add', extra)
  assert.ok(applyCalls.every((call) => call.options.grant === false))
})

await check('a removal still asks the manager to reconcile', async () => {
  // Revocation is driven by what the manager granted, so the request is passed
  // through even when this session cannot use the capability itself.
  applyCalls.length = 0
  mode = 'danger-full-access'
  await mutateWorkspace(ctx, service, SESSION, 'remove', extra)
  assert.ok(applyCalls.some((call) => call.roots.length === 0), 'the empty set is passed on')
})

rmSync(scratch, { recursive: true, force: true })
console.log(`\n${passed} checks passed`)
