/**
 * Focused checks for the two pure layers (path identity + durable store).
 * Run: node test/pure-layers.test.mjs
 */
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { canonicalPath, pathKey, samePath, isLexicallyUnder, isPathUnder, isUnderAny, resolveDirectory } from '../lib/paths.js'
import { RootsStore } from '../lib/store.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '.scratch')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(join(scratch, 'alpha', 'nested'), { recursive: true })
mkdirSync(join(scratch, 'alpha', 'child'), { recursive: true })
mkdirSync(join(scratch, 'beta'), { recursive: true })

let passed = 0
const check = (label, fn) => {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ---- path identity -------------------------------------------------------
check('canonicalPath normalizes separators and trailing separators', () => {
  const canonical = canonicalPath(`${scratch}/alpha/`)
  assert.equal(canonical, canonicalPath(join(scratch, 'alpha')))
  assert.ok(!canonical.endsWith('/') && !canonical.endsWith('\\'))
})

check('pathKey folds case on win32 and keeps distinct roots distinct', () => {
  const alpha = canonicalPath(join(scratch, 'alpha'))
  const beta = canonicalPath(join(scratch, 'beta'))
  assert.equal(pathKey(alpha), pathKey(alpha.toUpperCase()))
  assert.notEqual(pathKey(alpha), pathKey(beta))
  assert.ok(samePath(alpha, join(scratch, 'alpha', '.')))
  assert.ok(!samePath(alpha, beta))
})

check('lexical containment respects path separators', () => {
  const alpha = canonicalPath(join(scratch, 'alpha'))
  const nested = canonicalPath(join(scratch, 'alpha', 'nested'))
  assert.ok(isLexicallyUnder(alpha, alpha))
  assert.ok(isLexicallyUnder(nested, alpha))
  assert.ok(!isLexicallyUnder(canonicalPath(join(scratch, 'alpha-sibling')), alpha))
})

check('identity containment accepts a not-yet-created child', async () => {
  const alpha = canonicalPath(join(scratch, 'alpha'))
  assert.ok(await isPathUnder(canonicalPath(join(scratch, 'alpha', 'new-file.txt')), alpha))
  assert.ok(!(await isPathUnder(canonicalPath(join(scratch, 'beta', 'new-file.txt')), alpha)))
})

// ---- durable store -------------------------------------------------------
const storeFile = join(scratch, 'state', 'workspace-roots.json')
const primary = canonicalPath(join(scratch, 'alpha'))
const extra = canonicalPath(join(scratch, 'beta'))

const store = new RootsStore({ file: storeFile })
check('an empty store lists nothing', () => assert.deepEqual(store.list(primary), []))

check('add records a canonical root once', () => {
  assert.deepEqual(store.add(primary, `${extra}/`), { added: true, roots: [extra] })
  assert.deepEqual(store.add(primary, extra.toUpperCase()), { added: false, roots: [extra] })
  assert.deepEqual(store.list(join(scratch, 'ALPHA')), [extra])
})

const reopened = new RootsStore({ file: storeFile })
check('the record survives a reopen', () => assert.deepEqual(reopened.list(primary), [extra]))

check('roots are scoped to their own workspace', () => {
  const other = canonicalPath(join(scratch, 'beta'))
  assert.deepEqual(reopened.list(other), [])
})

check('remove deletes only the named root', () => {
  assert.deepEqual(reopened.remove(primary, extra), { removed: true, roots: [] })
  assert.deepEqual(reopened.remove(primary, extra), { removed: false, roots: [] })
})

check('clear forgets the workspace entry', () => {
  reopened.add(primary, extra)
  assert.deepEqual(reopened.clear(primary), { roots: [extra] })
  assert.deepEqual(reopened.list(primary), [])
})

check('a corrupt state file is discarded instead of trusted', () => {
  const corrupt = new RootsStore({ file: join(here, 'not-json.json') })
  assert.deepEqual(corrupt.list(primary), [])
})

// ---- directory resolution ------------------------------------------------
const resolved = await resolveDirectory('child', primary)
check('a relative argument resolves against the workspace', () => {
  assert.equal(resolved.path, canonicalPath(join(scratch, 'alpha', 'child')))
})

check('a missing or non-directory argument is rejected with a reason', async () => {
  const missing = await resolveDirectory('nope', primary)
  assert.ok('error' in missing)
  const file = await resolveDirectory('package.json', here)
  assert.ok('error' in file)
})

check('isUnderAny reports the matching root', async () => {
  const target = canonicalPath(join(scratch, 'beta', 'file.txt'))
  assert.equal(await isUnderAny(target, [primary, extra]), true)
  assert.equal(await isUnderAny(target, [primary]), false)
})

rmSync(scratch, { recursive: true, force: true })
console.log(`\n${passed} checks passed`)
