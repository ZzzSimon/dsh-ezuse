/**
 * Canonical path identity shared by every layer of dsh-ezuse.
 *
 * The host derives its writable roots with `realpath` and compares the result
 * lexically. A multi-root workspace must use the *same* identity or a root it
 * registers would never match the path a tool resolved. This module is the one
 * place that spelling is produced, so the store keys, the sandbox fence and the
 * Windows ACL grants cannot drift apart.
 */
import { realpathSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { dirname, resolve as resolvePath, sep } from 'node:path'

/** Windows compares paths case-insensitively; every other platform preserves case. */
const CASE_SENSITIVE = process.platform !== 'win32'

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

/**
 * Canonical absolute spelling of a path: separator-normalized, then `realpath`
 * when the path exists. A missing path keeps its resolved spelling, which is
 * the conservative choice — it matches nothing until it exists.
 * @param {string} path - a path in the execution world.
 * @returns {string} the canonical spelling, or `''` for a non-string or empty input.
 */
export function canonicalPath(path) {
  if (typeof path !== 'string' || path.length === 0) return ''
  let value = resolvePath(path)
  try {
    value = realpathSync.native(value)
  } catch {
    /* a missing path keeps its resolved spelling */
  }
  return value.length > 1 ? value.replace(/[\\/]+$/, '') : value
}

/**
 * Comparison key for one path: the canonical spelling, case-folded on Windows.
 * Never render this value — it exists for equality only.
 * @param {string} path - a path in the execution world.
 * @returns {string} the case-folded comparison key.
 */
export function pathKey(path) {
  const canonical = canonicalPath(path)
  return CASE_SENSITIVE ? canonical : canonical.toLowerCase()
}

/**
 * Whether two paths name the same directory.
 * @param {string} left - first path.
 * @param {string} right - second path.
 * @returns {boolean} true when both canonicalize to one key.
 */
export function samePath(left, right) {
  const leftKey = pathKey(left)
  return leftKey.length > 0 && leftKey === pathKey(right)
}

/** Case-fold one already-canonical path for lexical comparison. */
function comparable(value) {
  return CASE_SENSITIVE ? value : value.toLowerCase()
}

/**
 * Lexical containment of two canonical spellings — the fast path every
 * comparison starts with.
 * @param {string} target - canonical path to test.
 * @param {string} root - canonical root to test against.
 * @returns {boolean} true when `target` is `root` or lies beneath it.
 */
export function isLexicallyUnder(target, root) {
  const comparableTarget = comparable(target)
  const comparableRoot = comparable(root)
  if (comparableTarget === comparableRoot) return true
  const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep
  return comparableTarget.startsWith(prefix)
}

/** `stat` that reports only a missing entry as absent and rethrows real faults. */
async function statIfPresent(path) {
  try {
    return await fsp.stat(path, { bigint: true })
  } catch (error) {
    if (MISSING_CODES.has(error?.code)) return undefined
    throw error
  }
}

/**
 * Containment by filesystem identity — the conservative fallback for aliases a
 * lexical comparison cannot see (Windows 8.3 names, junction redirects).
 * Ported from the shipped filesystem fence so both agree on what "under a root"
 * means.
 * @param {string} target - canonical target path, which may end in a missing suffix.
 * @param {string} root - canonical root.
 * @returns {Promise<boolean>} whether the target is the root or a descendant of it.
 */
export async function isPathUnder(target, root) {
  if (isLexicallyUnder(target, root)) return true
  const rootInfo = await statIfPresent(root)
  if (rootInfo === undefined) return false
  let ancestor = target
  for (;;) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo !== undefined && ancestorInfo.dev === rootInfo.dev && ancestorInfo.ino === rootInfo.ino) return true
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

/**
 * Whether a target lies under any of the given roots.
 * @param {string} target - canonical target path.
 * @param {readonly string[]} roots - canonical roots.
 * @returns {Promise<boolean>} true when at least one root contains the target.
 */
export async function isUnderAny(target, roots) {
  for (const root of roots) {
    if (await isPathUnder(target, root)) return true
  }
  return false
}

/**
 * Resolve a user- or model-supplied directory argument against a base
 * directory and require that it is an existing directory.
 * @param {string} input - absolute or relative directory spelling.
 * @param {string} base - directory a relative input resolves against.
 * @returns {Promise<{ path: string } | { error: string }>} the canonical directory, or a user-facing reason.
 */
export async function resolveDirectory(input, base) {
  const trimmed = String(input ?? '').trim()
  if (trimmed.length === 0) return { error: '目录路径为空' }
  const absolute = resolvePath(base, trimmed)
  let info
  try {
    info = await fsp.stat(absolute)
  } catch (error) {
    const code = error?.code
    if (code === 'ENOENT') return { error: `目录不存在：${absolute}` }
    return { error: `无法读取目录 ${absolute}：${code ?? String(error)}` }
  }
  if (!info.isDirectory()) return { error: `不是目录：${absolute}` }
  const canonical = canonicalPath(absolute)
  if (canonical.length === 0) return { error: `目录路径无法规范化：${absolute}` }
  return { path: canonical }
}

/** Re-export the sync `realpath` used by callers that need a non-promise spelling. */
export { realpathSync }
