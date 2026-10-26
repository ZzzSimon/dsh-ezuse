/**
 * One config file for the whole plugin.
 *
 * The EZUSE settings page reads and writes this through the plugin's own HTTP
 * route, because a profile-installed plugin has no generated Remote namespace.
 * The file is deliberately plain JSON next to the workspace-roots record:
 * small, hand-editable, and shared by every browser that opens the GUI.
 *
 * Validation is narrow on purpose — an unknown or corrupt field falls back to its
 * default instead of reaching a feature that would then behave unexpectedly.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Every option this plugin currently exposes, with its default. */
export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  notifications: Object.freeze({
    /** Fire a browser notification when a turn finishes. */
    enabled: true,
    /** Only when the page is not visible (otherwise the GUI already shows it). */
    onlyWhenHidden: true,
    /** Which sound accompanies the notification: a chime, the five-note motif, or none. */
    sound: 'chime',
    /** Also notify when the model asks a question and waits for an answer. */
    onQuestion: true,
  }),
})

/**
 * The plugin's config file: `<DSH_HOME>/plugin-data/dsh-ezuse/config.json`.
 * @param {Record<string, string | undefined>} [env] - environment to read.
 * @returns {string} absolute path of the config file.
 */
export function resolveConfigFile(env = process.env) {
  const home = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'plugin-data', 'dsh-ezuse', 'config.json')
}

/** The accepted notification sounds. */
export const SOUND_KINDS = Object.freeze(['chime', 'mcdonalds', 'off'])

/**
 * Resolve the notification sound, accepting the older boolean spelling
 * (true → chime, false → off) so an existing config keeps working.
 * @param {unknown} value - stored value.
 * @returns {'chime' | 'mcdonalds' | 'off'} the sound to play.
 */
function soundKind(value) {
  if (value === true) return 'chime'
  if (value === false) return 'off'
  if (typeof value === 'string' && SOUND_KINDS.includes(value)) return value
  return DEFAULT_CONFIG.notifications.sound
}

/** Copy one boolean field, or the default when the value is not a boolean. */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Validate a parsed config document against {@link DEFAULT_CONFIG}.
 * @param {unknown} raw - parsed JSON (or anything else).
 * @returns {{ version: number, notifications: { enabled: boolean, onlyWhenHidden: boolean } }} a complete config.
 */
export function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const notifications = source.notifications !== null && typeof source.notifications === 'object' ? source.notifications : {}
  return {
    version: DEFAULT_CONFIG.version,
    notifications: {
      enabled: bool(notifications.enabled, DEFAULT_CONFIG.notifications.enabled),
      onlyWhenHidden: bool(notifications.onlyWhenHidden, DEFAULT_CONFIG.notifications.onlyWhenHidden),
      sound: soundKind(notifications.sound),
      onQuestion: bool(notifications.onQuestion, DEFAULT_CONFIG.notifications.onQuestion),
    },
  }
}

/** Durable config store. One instance per plugin activation. */
export class ConfigStore {
  /**
   * @param {{ file: string, logger?: { warn: (message: string) => void } }} options - config file and optional logger.
   */
  constructor(options) {
    this.file = options.file
    this.logger = options.logger
    this.config = this.#load()
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

  #load() {
    try {
      if (!existsSync(this.file)) return normalizeConfig(undefined)
      return normalizeConfig(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch (error) {
      this.logger?.warn(`dsh-ezuse: ignoring unreadable config ${this.file}: ${String(error)}`)
      return normalizeConfig(undefined)
    }
  }

  /** Re-read the file when it changed under us (a hand edit, or another window). */
  #refresh() {
    const fingerprint = this.#fingerprint()
    if (fingerprint === this.fingerprint) return
    this.fingerprint = fingerprint
    this.config = this.#load()
  }

  #write() {
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8')
    try {
      renameSync(temporary, this.file)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
    this.fingerprint = this.#fingerprint()
  }

  /**
   * The current config.
   * @returns {{ version: number, notifications: { enabled: boolean, onlyWhenHidden: boolean } }} a complete config.
   */
  get() {
    this.#refresh()
    return { version: this.config.version, notifications: { ...this.config.notifications } }
  }

  /**
   * Merge a partial config and persist it.
   * @param {unknown} patch - a partial document; unknown keys are ignored.
   * @returns {{ version: number, notifications: { enabled: boolean, onlyWhenHidden: boolean } }} the stored config.
   */
  set(patch) {
    this.#refresh()
    const source = patch !== null && typeof patch === 'object' ? patch : {}
    const notifications = source.notifications !== null && typeof source.notifications === 'object' ? source.notifications : {}
    this.config = normalizeConfig({
      notifications: { ...this.config.notifications, ...notifications },
    })
    this.#write()
    return this.get()
  }
}
