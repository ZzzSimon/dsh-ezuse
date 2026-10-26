/**
 * Shell write grants for the extra roots.
 *
 * Filesystem reads are never confined, but every confined shell call runs under
 * a write-restricted token. On Windows the harness grants that token write
 * access by adding a Write ACE for a per-workspace capability SID
 * (`workspaceWriteSid(cwd)`) to the workspace tree. An extra root therefore
 * becomes writable to `pwsh`-family calls in exactly the same way the primary
 * workspace is: the *same* SID gains an ACE on that directory.
 *
 * Cost model (measured): the ACE's inheritance is applied to every existing
 * child at roughly 0.05 ms per file for a grant and 0.1 ms for a revoke, while an
 * ACE that is already present is skipped in ~1 ms. That is why this module
 * copies the harness' posture instead of inventing its own:
 *
 *  - the grant is written once as a STANDING edit, so later mounts — including
 *    after a restart — hit the exact-ACE skip instead of re-propagating a tree.
 *    Deleting a grant object or unloading the plugin therefore does NOT revoke.
 *  - removal is explicit: `sync(workspace, [])` (or dropping one root) revokes
 *    exactly the removed paths.
 *  - none of it runs on the request path or on the host's event loop: the tab's
 *    response leaves immediately and `lib/grant-worker.js` does the tree walk.
 *    A worker that cannot start falls back to the in-process path, which is
 *    correct but blocking.
 *  - a caller that needs the ACE in place awaits `settled()`; the tool
 *    pre-flight does, so a confined shell call never races its own grant.
 *
 * `DSH_EZUSE_SHELL_GRANTS=0` turns shell grants off entirely (file writes still
 * work) and `DSH_EZUSE_REVOKE_ON_UNLOAD=1` makes an unload revoke everything.
 */
import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalPath, pathKey } from './paths.js'

const PACKAGE_SEGMENTS = ['node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js']

/**
 * Candidate entry files for the ACL package, most specific first.
 * @param {object} ctx - host context (reads the optional `sandbox` provider).
 * @returns {string[]} absolute `lib/index.js` candidates.
 */
function aclEntryCandidates(ctx) {
  const candidates = []
  const explicit = process.env.DSH_EZUSE_ACL_MODULE
  if (typeof explicit === 'string' && explicit.length > 0) {
    candidates.push(explicit.endsWith('index.js') ? explicit : join(explicit, 'lib', 'index.js'))
  }
  const sandbox = ctx.get?.('sandbox')
  try {
    const invocation = sandbox?.windowsAclRunnerInvocation?.()
    if (Array.isArray(invocation)) {
      for (const part of invocation) {
        if (typeof part === 'string' && part.endsWith('runner.js') && part.includes('dsh-sandbox-windows-acl')) {
          candidates.push(join(dirname(part), 'index.js'))
        }
      }
    }
  } catch {
    /* the provider is free to not expose its runner invocation */
  }
  for (const start of [process.argv[1], process.execPath]) {
    if (typeof start !== 'string' || start.length === 0) continue
    let level = dirname(start)
    for (;;) {
      candidates.push(join(level, ...PACKAGE_SEGMENTS))
      const parent = dirname(level)
      if (parent === level) break
      level = parent
    }
  }
  return candidates
}

/**
 * Locate the harness' Windows ACL package.
 * @param {object} ctx - host context.
 * @returns {string | undefined} the entry module path, when installed.
 */
function findAclEntry(ctx) {
  for (const candidate of aclEntryCandidates(ctx)) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Whether two root lists describe the same grant. */
function sameRoots(left, right) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/**
 * Create the shell-grant manager.
 * @param {object} ctx - host context (optional `logger`, `sandbox`).
 * @returns {{
 *   sync: (workspaceRoot: string, roots: readonly string[]) => void,
 *   settled: () => Promise<void>,
 *   status: () => { supported: boolean, granted: number, pending: boolean, reason?: string },
 *   disposeAll: () => Promise<void>,
 * }} the manager.
 */
export function createGrantManager(ctx) {
  const disabled = process.env.DSH_EZUSE_SHELL_GRANTS === '0'
  const revokeOnUnload = process.env.DSH_EZUSE_REVOKE_ON_UNLOAD === '1'
  const desired = new Map()
  const applied = new Map()
  const pending = new Set()

  let entry
  let worker
  let workerBroken = false
  let acl
  let chain = Promise.resolve()
  const waiters = new Map()
  let messaging = 0

  let failure = disabled
    ? 'shell write grants are disabled by DSH_EZUSE_SHELL_GRANTS'
    : process.platform !== 'win32'
      ? `shell write grants are Windows-only (host is ${process.platform})`
      : undefined

  const warn = (message) => ctx.logger?.warn?.(`dsh-ezuse: ${message}`)

  if (failure === undefined) {
    entry = findAclEntry(ctx)
    if (entry === undefined) failure = 'windows ACL sandbox package not found'
  }

  /** One message to the worker, resolved by its reply. */
  const ask = (message) =>
    new Promise((resolve, reject) => {
      if (worker === undefined) {
        reject(new Error(failure ?? 'grant worker unavailable'))
        return
      }
      const id = message.id ?? `m${(messaging += 1)}`
      waiters.set(id, { resolve, reject })
      worker.postMessage({ ...message, id })
    })

  const startWorker = () => {
    if (worker !== undefined) return worker
    if (workerBroken) return undefined
    try {
      // execArgv: [] — a worker must not inherit CLI flags such as --input-type,
      // --inspect or --require from however the harness was launched.
      const started = new Worker(new URL('./grant-worker.js', import.meta.url), { workerData: { entry }, execArgv: [] })
      started.unref?.()
      started.on('message', (message) => {
        const waiter = waiters.get(message?.id)
        if (waiter === undefined) return
        waiters.delete(message.id)
        if (message.type === 'failed') waiter.reject(new Error(message.error))
        else waiter.resolve(message)
      })
      const fail = (reason) => {
        workerBroken = true
        failure = reason
        warn(`shell grant worker stopped, falling back to in-process grants: ${reason}`)
        for (const [, waiter] of waiters) waiter.reject(new Error(reason))
        waiters.clear()
        const broken = worker
        worker = undefined
        void broken?.terminate?.()
      }
      started.on('error', (error) => fail(String(error?.message ?? error)))
      started.on('exit', (code) => {
        if (worker !== undefined && code !== 0) fail(`grant worker exited with code ${code}`)
      })
      worker = started
    } catch (error) {
      workerBroken = true
      failure = `grant worker could not start: ${String(error?.message ?? error)}`
      warn(failure)
      return undefined
    }
    return worker
  }

  /** Standing grant for `paths`; the ACEs outlive this call by contract. */
  const grantInProcess = async (sidRoot, paths) => {
    acl ??= await import(pathToFileURL(entry).href)
    const handle = acl.AclWriteGrant.create(acl.workspaceWriteSid(sidRoot))
    try {
      for (const path of paths) handle.add(path, true)
    } finally {
      try {
        handle.dispose()
      } catch {
        /* frees the SID handles; standing edits stay */
      }
    }
  }

  /** Explicit revocation: a throwaway revocable grant that is disposed at once. */
  const revokeInProcess = async (sidRoot, paths) => {
    acl ??= await import(pathToFileURL(entry).href)
    const handle = acl.AclWriteGrant.create(acl.workspaceWriteSid(sidRoot))
    try {
      for (const path of paths) handle.add(path, false)
    } finally {
      handle.dispose()
    }
  }

  /**
   * Apply one workspace's desired grant, on the worker or in-process.
   * @param {string} key - the workspace key.
   * @param {boolean} allowGrant - whether this session can use the capability at
   *   all (`workspace-write`). When false nothing is written — the ACE would be
   *   inert — but roots that were granted earlier are still revoked.
   */
  const applyKey = async (key, allowGrant) => {
    const target = desired.get(key)
    const roots = target === undefined ? [] : [...target.roots]
    const current = applied.get(key) ?? []
    const wanted = allowGrant ? roots : current.filter((root) => roots.includes(root))
    if (roots.length === 0 && current.length === 0) return
    if (wanted.length > 0 && sameRoots(wanted, current)) return
    if (disabled || entry === undefined) {
      applied.set(key, [])
      return
    }
    const removed = current.filter((root) => !wanted.includes(root))
    const added = allowGrant ? wanted.filter((root) => !current.includes(root)) : []
    const sidRoot = canonicalPath(target?.primary ?? key)
    if (removed.length === 0 && added.length === 0) return
    if (startWorker() !== undefined) {
      try {
        if (removed.length > 0) await ask({ type: 'revoke', id: key, sidRoot, paths: removed })
        if (added.length > 0) await ask({ type: 'grant', id: key, sidRoot, paths: wanted })
        applied.set(key, wanted)
        return
      } catch (error) {
        // The worker died mid-flight: do this one key on the host thread rather
        // than losing the grant.
        warn(`grant worker failed for ${key}, retrying in-process: ${String(error)}`)
      }
    }
    // Fallback: correct, but the tree walk runs on the host thread.
    if (removed.length > 0) await revokeInProcess(sidRoot, removed)
    if (added.length > 0) await grantInProcess(sidRoot, wanted)
    applied.set(key, wanted)
  }

  /** Whether this change would actually touch an ACE (and therefore pending state). */
  const workNeeded = (key, allowGrant) => {
    const target = desired.get(key)
    const roots = target === undefined ? [] : target.roots
    const current = applied.get(key) ?? []
    if (roots.length === 0 && current.length === 0) return false
    const wanted = allowGrant ? roots : current.filter((root) => roots.includes(root))
    if (wanted.length > 0 && sameRoots([...wanted], current)) return false
    return true
  }

  const schedule = (key, allowGrant) => {
    pending.add(key)
    chain = chain
      .then(async () => {
        try {
          await applyKey(key, allowGrant)
        } catch (error) {
          warn(`granting shell write access for ${key} failed: ${String(error)}`)
          applied.delete(key)
        } finally {
          pending.delete(key)
        }
      })
      .catch(() => {})
    return chain
  }

  return {
    /**
     * Declare the roots one workspace should have. Returns immediately: the
     * grant is applied in the background and observed through `status()` or
     * awaited with `settled()`.
     * @param {string} workspaceRoot - the session's cwd.
     * @param {readonly string[]} roots - canonical extra roots.
     * @param {{ grant?: boolean }} [options] - `grant: false` (a session outside
     *   `workspace-write`) records the roots without writing any ACE, because the
     *   ACE decides nothing there and a big tree costs a minute to walk. Roots
     *   this manager already granted are still revoked when they leave the list.
     */
    sync(workspaceRoot, roots, options = {}) {
      const key = pathKey(workspaceRoot)
      if (key.length === 0) return
      desired.set(key, { primary: workspaceRoot, roots: [...roots] })
      const allowGrant = options.grant !== false
      // Nothing to write (and nothing to revoke): do not even report pending.
      if (!workNeeded(key, allowGrant)) return
      schedule(key, allowGrant)
    },

    /** Resolve once every recorded change has been attempted. */
    settled() {
      return chain
    },

    /**
     * Whether shell writes are granted right now, and whether work is running.
     * @returns {{ supported: boolean, granted: number, pending: boolean, reason?: string }} the state.
     */
    status() {
      if (disabled || entry === undefined) {
        return { supported: false, granted: 0, pending: pending.size > 0, reason: failure }
      }
      let granted = 0
      for (const roots of applied.values()) granted += roots.length
      return { supported: true, granted, pending: pending.size > 0 }
    },

    /**
     * Release this manager. Standing ACEs stay (they are the reuse cache the next
     * start hits), unless `DSH_EZUSE_REVOKE_ON_UNLOAD=1` asks for a clean sweep.
     */
    async disposeAll() {
      pending.clear()
      const sweep = revokeOnUnload === true
      const records = [...desired.entries()].map(([key, value]) => ({ key, ...value }))
      desired.clear()
      if (worker !== undefined) {
        try {
          if (sweep) {
            await Promise.race([
              ask({ type: 'revokeAll', id: 'all' }),
              new Promise((resolve) => setTimeout(resolve, 5000)),
            ])
          }
        } catch {
          /* terminating the worker below is the fallback */
        }
        const stopping = worker
        worker = undefined
        try {
          await stopping.terminate()
        } catch {
          /* already gone */
        }
      }
      if (sweep) {
        for (const record of records) {
          const roots = applied.get(record.key)
          if (roots === undefined || roots.length === 0) continue
          try {
            await revokeInProcess(canonicalPath(record.primary), roots)
          } catch (error) {
            warn(`revoking shell write grants failed: ${String(error)}`)
          }
        }
      }
      applied.clear()
    },
  }
}
