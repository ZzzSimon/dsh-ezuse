/**
 * Durable, host-owned record of the extra workspace roots.
 *
 * Scope decision: roots belong to a *workspace directory*, not to one session.
 * The session's immutable cwd is the primary root the harness records, so every
 * session started in the same directory — a resumed one, a fork, a second tab —
 * sees the same additional roots. That matches the user's mental model ("this
 * project also lives in two other folders") and needs no per-session identity.
 *
 * The file is small, read once at load, and rewritten atomically on every
 * mutation; there is exactly one writer (the host process), so plain synchronous
 * I/O keeps the read-modify-write sequence indivisible.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { canonicalPath, pathKey } from './paths.js'

const FORMAT_VERSION = 1

/**
 * The plugin's state file: `<DSH_HOME>/plugin-data/dsh-ezuse/workspace-roots.json`.
 * `DSH_HOME` is set in every profile-launched harness; the documented fallback
 * keeps the plugin usable when it is mounted without a profile.
 * @param {Record<string, string | undefined>} [env] - environment to read.
 * @returns {string} absolute path of the state file.
 */
export function resolveStoreFile(env = process.env) {
  const home = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'plugin-data', 'dsh-ezuse', 'workspace-roots.json')
}

/** One stored workspace entry. */
function emptyState() {
  return { version: FORMAT_VERSION, workspaces: {} }
}

/**
 * Read + validate one parsed state document. Unknown shapes are discarded
 * rather than repaired: a hand-edited or truncated file must never widen a
 * writable root silently.
 * @param {unknown} raw - parsed JSON.
 * @returns {{ version: number, workspaces: Record<string, { primary: string, roots: string[] }> }} the valid state.
 */
function normalizeState(raw) {
  const state = emptyState()
  if (raw === null || typeof raw !== 'object') return state
  const workspaces = raw.workspaces
  if (workspaces === null || typeof workspaces !== 'object') return state
  for (const [key, entry] of Object.entries(workspaces)) {
    if (entry === null || typeof entry !== 'object') continue
    const roots = Array.isArray(entry.roots)
      ? entry.roots.filter((root) => typeof root === 'string' && root.length > 0).map((root) => canonicalPath(root))
      : []
    const primary = typeof entry.primary === 'string' ? entry.primary : ''
    if (roots.length === 0) continue
    state.workspaces[key] = { primary, roots }
  }
  return state
}

/** Durable roots store. One instance per plugin activation. */
export class RootsStore {
  /**
   * @param {{ file: string, logger?: { warn: (message: string) => void } }} options - state file and optional logger.
   */
  constructor(options) {
    this.file = options.file
    this.logger = options.logger
    this.state = this.#load()
    this.fingerprint = this.#fingerprint()
  }

  /** Cheap identity of the on-disk file, used to notice an external edit. */
  #fingerprint() {
    try {
      const info = statSync(this.file)
      return `${info.mtimeMs}:${info.size}`
    } catch {
      return 'missing'
    }
  }

  /**
   * Re-read the file when it changed under us (a hand edit, a second host
   * process, or a restore from a backup). Reads happen on the command path, the
   * prompt path and every tool pre-flight, so this must stay a single `stat`.
   */
  #refresh() {
    const fingerprint = this.#fingerprint()
    if (fingerprint === this.fingerprint) return
    this.fingerprint = fingerprint
    this.state = this.#load()
  }

  #load() {
    try {
      if (!existsSync(this.file)) return emptyState()
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      const state = normalizeState(parsed)
      if (state.version !== FORMAT_VERSION) return emptyState()
      return state
    } catch (error) {
      this.logger?.warn(`dsh-ezuse: ignoring unreadable state file ${this.file}: ${String(error)}`)
      return emptyState()
    }
  }

  #write() {
    const directory = dirname(this.file)
    mkdirSync(directory, { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
    try {
      renameSync(temporary, this.file)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
    this.fingerprint = this.#fingerprint()
  }

  /**
   * Additional roots recorded for one workspace directory.
   * @param {string} workspaceRoot - the session's cwd (any spelling).
   * @returns {string[]} canonical extra roots, in insertion order.
   */
  list(workspaceRoot) {
    this.#refresh()
    const entry = this.state.workspaces[pathKey(workspaceRoot)]
    return entry === undefined ? [] : [...entry.roots]
  }

  /**
   * Record one extra root.
   * @param {string} workspaceRoot - the session's cwd (any spelling).
   * @param {string} root - canonical directory to add.
   * @returns {{ added: boolean, roots: string[] }} whether it was new, plus the resulting list.
   */
  add(workspaceRoot, root) {
    this.#refresh()
    const key = pathKey(workspaceRoot)
    if (key.length === 0) return { added: false, roots: [] }
    const entry = this.state.workspaces[key] ?? { primary: canonicalPath(workspaceRoot), roots: [] }
    const canonical = canonicalPath(root)
    if (entry.roots.some((existing) => pathKey(existing) === pathKey(canonical))) {
      return { added: false, roots: [...entry.roots] }
    }
    entry.roots = [...entry.roots, canonical]
    this.state.workspaces[key] = entry
    this.#write()
    return { added: true, roots: [...entry.roots] }
  }

  /**
   * Remove one extra root by canonical path.
   * @param {string} workspaceRoot - the session's cwd (any spelling).
   * @param {string} root - the directory to remove (any spelling).
   * @returns {{ removed: boolean, roots: string[] }} whether it was present, plus the resulting list.
   */
  remove(workspaceRoot, root) {
    this.#refresh()
    const key = pathKey(workspaceRoot)
    const entry = this.state.workspaces[key]
    if (entry === undefined) return { removed: false, roots: [] }
    const target = pathKey(root)
    const remaining = entry.roots.filter((existing) => pathKey(existing) !== target)
    if (remaining.length === entry.roots.length) return { removed: false, roots: [...entry.roots] }
    if (remaining.length === 0) delete this.state.workspaces[key]
    else this.state.workspaces[key] = { primary: entry.primary, roots: remaining }
    this.#write()
    return { removed: true, roots: remaining }
  }

  /**
   * Forget every extra root of one workspace.
   * @param {string} workspaceRoot - the session's cwd (any spelling).
   * @returns {{ roots: string[] }} the roots that were removed.
   */
  clear(workspaceRoot) {
    this.#refresh()
    const key = pathKey(workspaceRoot)
    const entry = this.state.workspaces[key]
    if (entry === undefined) return { roots: [] }
    delete this.state.workspaces[key]
    this.#write()
    return { roots: [...entry.roots] }
  }
}
