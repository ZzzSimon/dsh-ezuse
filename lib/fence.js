/**
 * Multi-root support for the filesystem fence.
 *
 * The shipped fence (`@deepseek-ai/dsh-fs-sandbox`) resolves its writable
 * allow-list from `policy.workspaceRoot` alone, so a second directory can never
 * pass `workspace-write`. Rather than replace or re-implement that backend —
 * which would duplicate its atomic write, version guard and denial vocabulary —
 * this module decorates the live `ctx.fs` instance at its two mutation entry
 * points and, when the target really is under an extra root, replays the *same*
 * shipped call with that root as the policy's workspace root.
 *
 * Consequences that make this the narrow option:
 *  - `read-only` and `danger-full-access` are untouched (extra roots only ever
 *    widen `workspace-write`, never narrow or override another mode).
 *  - The write itself, its fresh-target re-canonicalization, its containment
 *    check and its `FS_SANDBOX_DENIED` error all stay the shipped code's.
 *  - A denial produces exactly one extra failed attempt per extra root and then
 *    the original call, so a session with no extra roots pays nothing.
 */
import { isAbsolute } from 'node:path'
import { canonicalPath, isPathUnder } from './paths.js'

/** Whether a thrown value is the fence's structured refusal. */
function isSandboxDenied(error) {
  if (error?.code === 'FS_SANDBOX_DENIED') return true
  return /file access denied under (read-only|workspace-write) mode/i.test(String(error?.message ?? ''))
}

/**
 * The policies worth replaying for one mutation: the calling policy, plus one
 * variant per extra root that contains the target. Empty when this session has
 * no extra roots — the caller then delegates untouched.
 * @param {object} ctx - host context (reads the optional `sandboxPolicy` fallback).
 * @param {{ displayPath?: string }} target - the resolved target the tool supplied.
 * @param {{ mode: string, workspaceRoot: string } | undefined} policy - the per-call policy.
 * @param {(workspaceRoot: string) => string[]} rootsOf - extra roots recorded for a workspace.
 * @returns {Promise<Array<{ mode: string, workspaceRoot: string }>>} policies to try, in order.
 */
async function replayPolicies(ctx, target, policy, rootsOf) {
  const base = policy ?? ctx.sandboxPolicy?.resolve?.()
  if (base === undefined || base.mode !== 'workspace-write') return []
  let roots
  try {
    roots = rootsOf(base.workspaceRoot)
  } catch {
    return []
  }
  if (!Array.isArray(roots) || roots.length === 0) return []
  const displayPath = target?.displayPath
  if (typeof displayPath !== 'string' || !isAbsolute(displayPath)) return []
  const canonical = canonicalPath(displayPath)
  if (canonical.length === 0) return []
  const policies = []
  for (const root of roots) {
    if (await isPathUnder(canonical, root)) policies.push({ ...base, workspaceRoot: root })
  }
  return policies
}

/**
 * Install the multi-root replay on the live filesystem service.
 * @param {object} ctx - host context (optional `sandboxPolicy`, `logger`).
 * @param {object} fsService - the live `ctx.fs` implementation to decorate.
 * @param {(workspaceRoot: string) => string[]} rootsOf - extra roots recorded for a workspace.
 * @returns {() => void} disposer restoring the shipped methods.
 */
export function installFsFence(ctx, fsService, rootsOf) {
  if (fsService === undefined || fsService === null) return () => {}
  if (typeof fsService.writeText !== 'function' || typeof fsService.editText !== 'function') return () => {}

  const originalWrite = fsService.writeText
  const originalEdit = fsService.editText
  if (originalWrite.__dshEzuseFence === true) return () => {}

  /** Replay `invoke` once per candidate policy, then fall back to the shipped call. */
  const withReplay = async (invoke, target, policy) => {
    let candidates = []
    try {
      candidates = await replayPolicies(ctx, target, policy, rootsOf)
    } catch (error) {
      ctx.logger?.warn?.(`dsh-ezuse: extra-root lookup failed, keeping the shipped fence: ${String(error)}`)
      candidates = []
    }
    for (const candidate of candidates) {
      try {
        return await invoke(candidate)
      } catch (error) {
        if (!isSandboxDenied(error)) throw error
      }
    }
    return invoke(policy)
  }

  const patchedWrite = async function writeTextWithExtraRoots(target, content, expected, signal, sandboxPolicy) {
    return withReplay(
      (policy) => originalWrite.call(fsService, target, content, expected, signal, policy),
      target,
      sandboxPolicy,
    )
  }
  patchedWrite.__dshEzuseFence = true

  const patchedEdit = async function editTextWithExtraRoots(target, edit, expected, signal, sandboxPolicy) {
    return withReplay(
      (policy) => originalEdit.call(fsService, target, edit, expected, signal, policy),
      target,
      sandboxPolicy,
    )
  }
  patchedEdit.__dshEzuseFence = true

  fsService.writeText = patchedWrite
  fsService.editText = patchedEdit

  return () => {
    if (fsService.writeText === patchedWrite) fsService.writeText = originalWrite
    if (fsService.editText === patchedEdit) fsService.editText = originalEdit
  }
}
