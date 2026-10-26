/**
 * One-off measurement: what does granting one directory really cost, and does an
 * already-present ACE skip the tree walk?
 *
 * Run: node scripts/measure-grant.mjs <acl-entry> <dir>
 */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { canonicalPath } from '../lib/paths.js'

const [entry, target] = process.argv.slice(2)
if (!entry || !target) throw new Error('usage: node scripts/measure-grant.mjs <acl-entry> <dir>')
const acl = await import(pathToFileURL(entry).href)

const scratch = join(tmpdir(), `ezuse-measure-${process.pid}`)
rmSync(scratch, { recursive: true, force: true })
const workspace = join(scratch, 'workspace')
mkdirSync(workspace, { recursive: true })

const files = Number(process.env.ECHO_FILES ?? 8000)
const dirs = 40
for (let d = 0; d < dirs; d += 1) {
  const nested = join(target, `m${d}`)
  mkdirSync(nested, { recursive: true })
  for (let f = 0; f < files / dirs; f += 1) writeFileSync(join(nested, `f${f}.txt`), 'x')
}
console.log(`files=${files} dirs=${dirs}`)

const sid = acl.workspaceWriteSid(canonicalPath(workspace))
const time = (label, fn) => {
  const started = process.hrtime.bigint()
  fn()
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  console.log(`${label}: ${ms.toFixed(0)} ms`)
  return ms
}

const first = acl.AclWriteGrant.create(sid)
time('grant.add (revocable, first)', () => first.add(target, false))

const second = acl.AclWriteGrant.create(sid)
time('grant.add again (ACE already present)', () => second.add(target, false))
second.dispose()

const standing = acl.AclWriteGrant.create(sid)
time('grant.add (standing, ACE present)', () => standing.add(target, true))

const third = acl.AclWriteGrant.create(sid)
time('grant.add after standing (ACE present)', () => third.add(target, false))
third.dispose()
time('standing.dispose (standing edits stay)', () => standing.dispose())

const revoke = acl.AclWriteGrant.create(sid)
time('revoke round-trip (add revocable + dispose)', () => {
  revoke.add(target, false)
  revoke.dispose()
})

rmSync(scratch, { recursive: true, force: true })
