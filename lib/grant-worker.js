/**
 * ACL propagation off the host's event loop.
 *
 * Writing a write ACE onto a directory makes Windows apply the inheritable ACE
 * to every existing child — measured at roughly 0.05 ms per FILE for a grant and
 * 0.1 ms for a revoke, so a repository with a `node_modules` tree costs tens of
 * seconds. The ACL package is synchronous FFI, so doing that on the host thread
 * freezes every request, every stream and every other plugin for the duration.
 *
 * This worker owns the grants instead: the host posts one message per workspace
 * and keeps answering. Two behaviours matter for cost:
 *
 *  - a grant is written as a STANDING edit (the same posture the harness uses
 *    for a workspace root), so the ACE survives restarts and every later mount
 *    of that directory hits the ACL package's exact-ACE skip (~1 ms). Revoking
 *    on unload would pay the propagation again on the next start for nothing.
 *  - a revoke therefore has to be explicit: a throwaway revocable grant records
 *    the path as revocable, and disposing it removes that ACE.
 *
 * The entry path arrives in `workerData` because a worker thread has its own
 * module cache and the same bare-import restriction the host has.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'

/** @type {{ AclWriteGrant: { create: Function }, workspaceWriteSid: Function } | undefined} */
let acl
/** One record per workspace key: the SID and the paths currently granted. */
const records = new Map()

async function loadAcl() {
  if (acl === undefined) acl = await import(pathToFileURL(workerData.entry).href)
  return acl
}

/** Apply one standing grant and release the handle (the ACEs stay). */
async function grant(key, sidRoot, paths) {
  const module = await loadAcl()
  const writeSid = module.workspaceWriteSid(sidRoot)
  const handle = module.AclWriteGrant.create(writeSid)
  try {
    for (const path of paths) handle.add(path, true)
  } finally {
    try {
      handle.dispose()
    } catch {
      /* frees the SID handles; standing edits stay by contract */
    }
  }
  records.set(key, { writeSid, sidRoot, paths: [...paths] })
}

/** Remove the capability ACE from the given paths (a throwaway revocable grant). */
async function revoke(paths, sidRoot, writeSid) {
  if (paths.length === 0) return
  const module = await loadAcl()
  const sid = writeSid ?? module.workspaceWriteSid(sidRoot)
  const handle = module.AclWriteGrant.create(sid)
  try {
    for (const path of paths) handle.add(path, false)
  } finally {
    handle.dispose()
  }
}

parentPort?.on('message', (message) => {
  void (async () => {
    try {
      if (message?.type === 'grant') {
        await grant(message.id, message.sidRoot, message.paths)
        parentPort?.postMessage({ type: 'granted', id: message.id })
        return
      }
      if (message?.type === 'revoke') {
        const record = records.get(message.id)
        const paths = message.paths ?? record?.paths ?? []
        await revoke(paths, message.sidRoot, record?.writeSid)
        records.delete(message.id)
        parentPort?.postMessage({ type: 'revoked', id: message.id })
        return
      }
      if (message?.type === 'revokeAll') {
        for (const [id, record] of records) {
          try {
            await revoke(record.paths, record.sidRoot, record.writeSid)
          } catch {
            /* report once, keep revoking the rest */
          }
          records.delete(id)
        }
        parentPort?.postMessage({ type: 'revokedAll', id: message.id })
        return
      }
      parentPort?.postMessage({ type: 'failed', id: message?.id, error: `unknown message: ${String(message?.type)}` })
    } catch (error) {
      parentPort?.postMessage({ type: 'failed', id: message?.id, error: String(error?.message ?? error) })
    }
  })()
})
