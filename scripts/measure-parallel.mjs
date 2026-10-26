/**
 * Does fanning the grant out across sibling subtrees buy wall-clock time?
 *
 * The kernel's inheritance walk is per object and runs inside one
 * `SetNamedSecurityInfoW` call, so a single call is serial. Separate subtrees are
 * independent ACL targets, so splitting them across worker threads may overlap.
 *
 * Run: node scripts/measure-parallel.mjs <acl-entry> [subdirs] [filesPerDir]
 */
import { Worker } from 'node:worker_threads'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { canonicalPath } from '../lib/paths.js'

const [entry, subdirsArg, filesArg] = process.argv.slice(2)
if (!entry) throw new Error('usage: node scripts/measure-parallel.mjs <acl-entry> [subdirs] [filesPerDir]')
const subdirs = Number(subdirsArg ?? 8)
const filesPerDir = Number(filesArg ?? 600)
const workers = Math.min(8, subdirs)

const acl = await import(pathToFileURL(entry).href)
const base = join(tmpdir(), `ezuse-par-${process.pid}`)
rmSync(base, { recursive: true, force: true })
const workspace = join(base, 'ws')
mkdirSync(workspace, { recursive: true })
const target = join(base, 'tree')
mkdirSync(target, { recursive: true })
for (let d = 0; d < subdirs; d += 1) {
  const nested = join(target, `s${d}`)
  mkdirSync(nested, { recursive: true })
  for (let f = 0; f < filesPerDir; f += 1) writeFileSync(join(nested, `f${f}.txt`), 'x')
}
console.log(`objects≈${subdirs * (filesPerDir + 1) + 1}, workers=${workers}`)

const sid = acl.workspaceWriteSid(canonicalPath(workspace))

/** Grant one path in the calling thread. */
const grantHere = (path) => {
  const handle = acl.AclWriteGrant.create(sid)
  try {
    handle.add(path, false)
  } finally {
    handle.dispose()
  }
}

const time = async (label, fn) => {
  const started = Date.now()
  await fn()
  const ms = Date.now() - started
  console.log(`${label}: ${ms} ms`)
  return ms
}

const workerSource = `
import { parentPort, workerData } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
const acl = await import(pathToFileURL(workerData.entry).href)
for (const path of workerData.paths) {
  const handle = acl.AclWriteGrant.create(workerData.sid)
  try { handle.add(path, false) } finally { try { handle.dispose() } catch {} }
}
parentPort.postMessage('done')
`
const URL_OF_WORKER = new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`)

/** Run the grant (or revoke) for one path on one worker thread. */
const runOnWorker = (path) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(URL_OF_WORKER, { workerData: { entry, sid, paths: [path] }, execArgv: [] })
    worker.once('message', () => void worker.terminate().then(resolve))
    worker.once('error', reject)
  })

const subtrees = Array.from({ length: subdirs }, (_, d) => join(target, `s${d}`))

const serial = await time('serial grant on the root', () => grantHere(target))
await time('serial revoke on the root', () => grantHere(target))

const parallel = await time(`parallel grants (${workers} workers)`, async () => {
  const queue = [...subtrees]
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const path = queue.shift()
        if (path === undefined) return
        await runOnWorker(path)
      }
    }),
  )
})

await Promise.all(subtrees.map((path) => runOnWorker(path)))

console.log(`\nspeed-up: ${(serial / Math.max(parallel, 1)).toFixed(1)}×`)
rmSync(base, { recursive: true, force: true })
