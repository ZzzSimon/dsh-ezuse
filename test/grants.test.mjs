/**
 * Verification for the Windows shell-write grants: the extra root really gains a
 * Write ACE for the *workspace capability SID* the confined child carries,
 * disposing the manager removes it again, and — the reason this module exists —
 * asking for the grant does NOT block the caller while the ACE propagates.
 *
 * The harness' ACL package is located from `DSH_EZUSE_ACL_MODULE` or from the
 * host's own runner invocation; when neither exists (a plain checkout) the test
 * reports that it was skipped instead of failing.
 *
 * Run: node test/grants.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { canonicalPath } from '../lib/paths.js'

if (process.platform !== 'win32') {
  console.log('skipped — shell write grants only exist on win32')
  process.exit(0)
}

/** Locate the harness' ACL package without assuming its installation path. */
function locatePackage() {
  const configured = process.env.DSH_EZUSE_ACL_MODULE
  const candidates = []
  if (typeof configured === 'string' && configured.length > 0) {
    candidates.push(configured.endsWith('index.js') ? configured : join(configured, 'lib', 'index.js'))
  }
  for (const start of [process.argv[1], process.execPath]) {
    let level = dirname(String(start))
    for (;;) {
      candidates.push(join(level, 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js'))
      const parent = dirname(level)
      if (parent === level) break
      level = parent
    }
  }
  return candidates.find((candidate) => existsSync(candidate))
}

const entry = locatePackage()
if (entry === undefined) {
  console.log('skipped — @deepseek-ai/dsh-sandbox-windows-acl not found (set DSH_EZUSE_ACL_MODULE)')
  process.exit(0)
}

const acl = await import(pathToFileURL(entry).href)
const { createGrantManager } = await import('../lib/grants.js')

const scratch = join(tmpdir(), `dsh-ezuse-grants-${process.pid}`)
rmSync(scratch, { recursive: true, force: true })
const primary = join(scratch, 'primary')
const extra = join(scratch, 'extra')
mkdirSync(primary, { recursive: true })
mkdirSync(extra, { recursive: true })

// A tree big enough that an in-process propagation would be visible.
for (let directory = 0; directory < 8; directory += 1) {
  const nested = join(extra, `d${directory}`)
  mkdirSync(nested, { recursive: true })
  for (let file = 0; file < 40; file += 1) writeFileSync(join(nested, `f${file}.txt`), 'x')
}

const ctx = {
  logger: { warn: (message) => console.warn(`warn: ${message}`) },
  get(name) {
    if (name === 'sandbox') {
      return { windowsAclRunnerInvocation: () => [process.execPath, join(dirname(entry), 'runner.js')] }
    }
    return undefined
  },
}

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

/** The SID the sandbox derives for this workspace — what the child token carries. */
const writeSid = acl.workspaceWriteSid(canonicalPath(primary))

/** Whether `icacls` reports the capability SID on one directory. */
const aclHasSid = (directory) => {
  const output = execFileSync('icacls', [directory], { encoding: 'utf8' })
  return output.includes(writeSid)
}

const manager = createGrantManager(ctx)

await check('the manager finds the harness ACL package', () => {
  const status = manager.status()
  assert.equal(status.supported, true, status.reason)
  assert.equal(status.pending, false)
})

await check('the extra root has no capability ACE before the grant', () => {
  assert.equal(aclHasSid(extra), false)
})

await check('sync() returns before the ACE work finishes', async () => {
  const started = Date.now()
  manager.sync(primary, [extra])
  const elapsed = Date.now() - started
  assert.ok(elapsed < 200, `sync() took ${elapsed}ms — it must not wait for propagation`)
  await manager.settled()
})

await check('the workspace SID is granted once the work settles', () => {
  assert.equal(aclHasSid(extra), true)
  assert.equal(manager.status().granted, 1)
  assert.equal(manager.status().pending, false)
})

await check('objects created after the grant inherit it with no further pass', async () => {
  // This is what `pnpm install` / `git checkout` do: create a whole new subtree.
  // The inheritable ACE lands on each new object at creation, so nothing here
  // may trigger another propagation.
  const nestedDir = join(extra, 'node_modules', 'pkg', 'lib', 'deep')
  mkdirSync(nestedDir, { recursive: true })
  for (let index = 0; index < 200; index += 1) writeFileSync(join(nestedDir, `f${index}.js`), 'x')
  writeFileSync(join(extra, 'pnpm-lock.yaml'), 'x')

  const deepFile = execFileSync('icacls', [join(nestedDir, 'f7.js')], { encoding: 'utf8' })
  assert.ok(deepFile.includes(writeSid), 'a newly created nested file inherited the capability ACE')
  assert.match(deepFile, /\(I\)/, 'and it is marked inherited, not propagated afterwards')
  const newDir = execFileSync('icacls', [join(extra, 'node_modules', 'pkg', 'lib')], { encoding: 'utf8' })
  assert.ok(newDir.includes(writeSid), 'a newly created directory inherited it too')
  assert.equal(manager.status().granted, 1, 'still one grant — nothing re-ran')
})

await check('a second sync with the same roots does not regrant', async () => {
  manager.sync(primary, [extra])
  await manager.settled()
  assert.equal(manager.status().granted, 1)
})

await check('dropping the root revokes the capability ACE', async () => {
  manager.sync(primary, [], { grant: true })
  await manager.settled()
  assert.equal(aclHasSid(extra), false)
  assert.equal(manager.status().granted, 0)
})

await check('unloading keeps the standing ACE (the reuse cache)', async () => {
  manager.sync(primary, [extra])
  await manager.settled()
  assert.equal(aclHasSid(extra), true)
  await manager.disposeAll()
  assert.equal(aclHasSid(extra), true)
})

await check('a manager started after a restart leaves the standing ACE alone', async () => {
  // Nothing is known to revoke after a restart, and revoking blindly would walk
  // a tree to remove an ACE that may not exist. Standing ACEs are the cache.
  const afterRestart = createGrantManager(ctx)
  afterRestart.sync(primary, [], { grant: true })
  await afterRestart.settled()
  assert.equal(aclHasSid(extra), true)
  await afterRestart.disposeAll()
})

await check('grant: false records roots without writing a single ACE', async () => {
  // Put the directory back to a clean state first (the previous check left it).
  const cleaner = createGrantManager(ctx)
  cleaner.sync(primary, [extra])
  await cleaner.settled()
  cleaner.sync(primary, [], { grant: true })
  await cleaner.settled()
  await cleaner.disposeAll()
  assert.equal(aclHasSid(extra), false)

  const blocked = createGrantManager(ctx)
  blocked.sync(primary, [extra], { grant: false })
  await blocked.settled()
  assert.equal(aclHasSid(extra), false)
  assert.equal(blocked.status().granted, 0)
  await blocked.disposeAll()
})

await check('the derived SID is stable for one workspace', () => {
  assert.equal(acl.workspaceWriteSid(canonicalPath(primary)), writeSid)
  assert.notEqual(acl.workspaceWriteSid(canonicalPath(extra)), writeSid)
})

await check('the disable switch reports a reason instead of granting', async () => {
  process.env.DSH_EZUSE_SHELL_GRANTS = '0'
  const off = createGrantManager(ctx)
  assert.equal(off.status().supported, false)
  assert.match(String(off.status().reason), /DSH_EZUSE_SHELL_GRANTS/)
  off.sync(primary, [extra])
  await off.settled()
  assert.equal(aclHasSid(extra), false)
  delete process.env.DSH_EZUSE_SHELL_GRANTS
  await off.disposeAll()
})

rmSync(scratch, { recursive: true, force: true })
console.log(`\n${passed} checks passed`)
