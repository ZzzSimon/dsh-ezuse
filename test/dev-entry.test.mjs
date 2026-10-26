/**
 * Checks for the development entry: `dev.js` must forward the row's `?v=` to a
 * fresh `index.js` module URL, so each bump is a new module generation instead
 * of a cache hit.
 *
 * Run: node test/dev-entry.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
process.env.DSH_HOME = join(here, '.scratch-dev', 'home')

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// Self-reference: a package resolves its own name through `exports`.
const first = await import('dsh-ezuse/dev.js?v=alpha')
const second = await import('dsh-ezuse/dev.js?v=beta')
const bare = await import('dsh-ezuse/dev.js')

await check('the dev entry exposes the plugin contract', () => {
  for (const module of [first, second, bare]) {
    assert.equal(module.name, 'dsh-ezuse')
    assert.deepEqual(module.inject, ['commands'])
    assert.equal(typeof module.apply, 'function')
  }
})

await check('each version is a distinct module generation', () => {
  assert.notEqual(first.apply, second.apply)
  assert.notEqual(first.apply, bare.apply)
})

await check('the named helpers travel with the entry', () => {
  for (const module of [first, second]) {
    assert.equal(typeof module.handleCommand, 'function')
    assert.equal(typeof module.describeWorkspace, 'function')
    assert.equal(typeof module.mutateWorkspace, 'function')
    assert.equal(typeof module.renderPromptContext, 'function')
  }
})

await check('the forwarded version reaches index.js', () => {
  // `apply` is defined in index.js; two versions therefore carry different
  // closures over two distinct RootsStore instances.
  const source = readFileSync(join(here, '..', 'dev.js'), 'utf8')
  assert.match(source, /searchParams\.get\('v'\)/)
  assert.match(source, /import\(`\.\/index\.js\?v=\$\{encodeURIComponent\(REVISION\)\}`\)/)
})

console.log(`\n${passed} checks passed`)
