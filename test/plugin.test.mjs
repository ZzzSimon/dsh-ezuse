/**
 * Wiring test for the plugin entry: a mock host context exercises the real
 * `apply()`, the real `/workspace` handler, the real filesystem-fence replay
 * and the real runtime-context contribution — without a running harness.
 *
 * The mock filesystem reproduces the shipped fence's contract: `read-only`
 * denies everything, `workspace-write` allows only what lies under
 * `policy.workspaceRoot`, `danger-full-access` allows everything.
 *
 * Run: node test/plugin.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalPath, isLexicallyUnder } from '../lib/paths.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '.scratch-plugin')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(join(scratch, 'home'), { recursive: true })
mkdirSync(join(scratch, 'primary'), { recursive: true })
mkdirSync(join(scratch, 'extra'), { recursive: true })
mkdirSync(join(scratch, 'outside'), { recursive: true })

process.env.DSH_HOME = join(scratch, 'home')

const primary = canonicalPath(join(scratch, 'primary'))
const extra = canonicalPath(join(scratch, 'extra'))
const outside = canonicalPath(join(scratch, 'outside'))

// ---- mock host ------------------------------------------------------------
const writes = []
const denied = (target) =>
  Object.assign(new Error(`cannot write "${target}": file access denied under workspace-write mode`), {
    code: 'FS_SANDBOX_DENIED',
  })

const fsService = {
  async writeText(target, content, expected, signal, policy) {
    if (policy?.mode === 'read-only') {
      throw Object.assign(new Error(`cannot write "${target.displayPath}": file access denied under read-only mode`), {
        code: 'FS_SANDBOX_DENIED',
      })
    }
    if (policy?.mode !== 'danger-full-access') {
      const root = canonicalPath(policy?.workspaceRoot ?? '')
      if (root.length === 0 || !isLexicallyUnder(canonicalPath(target.displayPath), root)) throw denied(target.displayPath)
    }
    writes.push({ path: target.displayPath, content })
    return { version: 'v1' }
  },
  async editText(target, edit, expected, signal, policy) {
    if (policy?.mode === 'read-only') {
      throw Object.assign(new Error(`cannot write "${target.displayPath}": file access denied under read-only mode`), {
        code: 'FS_SANDBOX_DENIED',
      })
    }
    if (policy?.mode !== 'danger-full-access') {
      const root = canonicalPath(policy?.workspaceRoot ?? '')
      if (root.length === 0 || !isLexicallyUnder(canonicalPath(target.displayPath), root)) throw denied(target.displayPath)
    }
    writes.push({ path: target.displayPath, content: edit.find })
    return { version: 'v2' }
  },
}

const registered = []
const listeners = new Map()
const contexts = []
const cleanups = []
const warnings = []

const ctx = {
  logger: { warn: (message) => warnings.push(message), info: () => {}, error: () => {} },
  get(name) {
    if (name === 'fs') return fsService
    if (name === 'sandbox') return undefined
    return undefined
  },
  effect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return cleanup
  },
  on(event, listener) {
    const list = listeners.get(event) ?? []
    list.push(listener)
    listeners.set(event, list)
    return () => {}
  },
  inject(names, callback) {
    callback({
      fs: names.includes('fs') ? fsService : undefined,
      systemPrompt: { context: (definition) => contexts.push(definition) },
      effect: ctx.effect,
      logger: ctx.logger,
      get: ctx.get,
    })
  },
  commands: { register: (definition) => (registered.push(definition), () => {}) },
}

const plugin = await import('../index.js')
plugin.apply(ctx)

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

const command = registered.find((definition) => definition.name === 'workspace')
const contextDefinition = contexts.find((definition) => definition.name === 'ezuse:workspace-roots')
const run = (rawInput) =>
  command.handler({ agent: { session: { header: { cwd: primary } } }, rawInput, signal: new AbortController().signal })
const writeTo = (directory) => fsService.writeText({ displayPath: join(directory, 'file.txt') }, 'content', undefined, undefined, {
  mode: 'workspace-write',
  workspaceRoot: primary,
})
const contextText = () => contextDefinition.text({ agent: { session: { header: { cwd: primary } } } })

// ---- registration --------------------------------------------------------
await check('the plugin registers one /workspace command and one context', () => {
  assert.ok(command, 'command registered')
  assert.equal(command.name, 'workspace')
  assert.ok(contextDefinition, 'runtime context registered')
  assert.equal(contextDefinition.order, 112)
})

await check('a listing with no extra roots reports the primary workspace', async () => {
  const result = await run('list')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /主工作区/)
  assert.match(result.text, /附加目录：无/)
  assert.equal(contextText(), '')
})

// ---- adding a root -------------------------------------------------------
await check('the extra root is denied before it is mounted', async () => {
  await assert.rejects(writeTo(extra), (error) => error.code === 'FS_SANDBOX_DENIED')
})

await check('`add <path>` records the directory and reports it', async () => {
  const result = await run(`add ${extra}`)
  assert.equal(result.kind, 'success', result.text)
  assert.match(result.text, /已加入附加目录/)
  assert.match(result.text, /附加目录（1）/)
})

await check('the model is told the mounted root', () => {
  const text = contextText()
  assert.match(text, /Additional workspace roots/)
  assert.ok(text.includes(JSON.stringify(extra)), text)
  assert.ok(text.includes(JSON.stringify(primary)), text)
})

await check('a write inside the extra root now passes the fence', async () => {
  const outcome = await writeTo(extra)
  assert.equal(outcome.version, 'v1')
  assert.ok(writes.some((write) => write.path === join(extra, 'file.txt')))
})

await check('an edit inside the extra root also passes', async () => {
  const outcome = await fsService.editText(
    { displayPath: join(extra, 'file.txt') },
    { find: 'a', replace: 'b' },
    undefined,
    undefined,
    { mode: 'workspace-write', workspaceRoot: primary },
  )
  assert.equal(outcome.version, 'v2')
})

await check('a write outside every root still gets the shipped denial', async () => {
  await assert.rejects(writeTo(outside), (error) => error.code === 'FS_SANDBOX_DENIED')
})

await check('read-only is never widened by an extra root', async () => {
  const deniedByMode = () =>
    fsService.writeText({ displayPath: join(extra, 'file.txt') }, 'content', undefined, undefined, {
      mode: 'read-only',
      workspaceRoot: primary,
    })
  await assert.rejects(deniedByMode, (error) => error.code === 'FS_SANDBOX_DENIED')
})

await check('danger-full-access keeps delegating untouched', async () => {
  const outcome = await fsService.writeText(
    { displayPath: join(outside, 'file.txt') },
    'content',
    undefined,
    undefined,
    { mode: 'danger-full-access', workspaceRoot: primary },
  )
  assert.equal(outcome.version, 'v1')
})

// ---- duplicate / removal / clear ----------------------------------------
await check('adding the same directory twice is idempotent', async () => {
  const result = await run(`add ${extra}`)
  assert.equal(result.kind, 'success')
  assert.match(result.text, /已在附加目录中/)
})

await check('adding the primary workspace is refused as redundant', async () => {
  const result = await run(`add ${primary}`)
  assert.equal(result.kind, 'success')
  assert.match(result.text, /就是当前主工作区/)
})

await check('`add` without an argument reports the non-native picker', async () => {
  const result = await run('add')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /绝对路径/)
})

await check('`remove 1` drops the root and the fence closes again', async () => {
  const result = await run('remove 1')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /已移除/)
  assert.equal(contextText(), '')
  await assert.rejects(writeTo(extra), (error) => error.code === 'FS_SANDBOX_DENIED')
})

await check('`clear` empties the record', async () => {
  await run(`add ${extra}`)
  const result = await run('clear')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /已清空 1 个附加目录/)
  assert.equal(contextText(), '')
})

await check('an unknown subcommand returns usage instead of throwing', async () => {
  const result = await run('bogus')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /未知子命令/)
})

await check('a session without a cwd is refused politely', async () => {
  const result = await command.handler({ agent: { session: { header: {} } }, rawInput: 'list' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /没有工作区目录/)
})

// ---- hooks ---------------------------------------------------------------
await check('the tool pre-flight listener returns next() and never throws', async () => {
  const [listener] = listeners.get('tools/pre-execute') ?? []
  assert.ok(listener, 'pre-execute listener registered')
  let called = false
  const decision = await listener({ agent: { session: { header: { cwd: primary } } } }, async () => {
    called = true
    return { kind: 'allow' }
  })
  assert.equal(called, true)
  assert.deepEqual(decision, { kind: 'allow' })
})

await check('unloading restores the shipped filesystem methods', async () => {
  const patched = fsService.writeText
  assert.equal(patched.__dshEzuseFence, true)
  for (const cleanup of cleanups) cleanup()
  assert.notEqual(fsService.writeText, patched)
  assert.equal(fsService.writeText.__dshEzuseFence, undefined)
  await assert.rejects(writeTo(extra), (error) => error.code === 'FS_SANDBOX_DENIED')
})

rmSync(scratch, { recursive: true, force: true })
if (warnings.length > 0) console.log(`warnings: ${warnings.join(' | ')}`)
console.log(`\n${passed} checks passed`)
