/**
 * Checks for the plugin's single config file: defaults, partial patches,
 * validation of hand-edited values, and the external-edit refresh.
 *
 * Run: node test/config.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigStore, DEFAULT_CONFIG, normalizeConfig, resolveConfigFile } from '../lib/config.js'

const here = dirname(fileURLToPath(import.meta.url))
const scratch = join(here, '.scratch-config')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(scratch, { recursive: true })

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

await check('the config path follows DSH_HOME', () => {
  const path = resolveConfigFile({ DSH_HOME: 'C:\\dsh-home' })
  assert.equal(path, join('C:\\dsh-home', 'plugin-data', 'dsh-ezuse', 'config.json'))
})

await check('a missing document normalizes to the defaults', () => {
  assert.deepEqual(normalizeConfig(undefined), {
    version: 1,
    notifications: {
      enabled: DEFAULT_CONFIG.notifications.enabled,
      onlyWhenHidden: DEFAULT_CONFIG.notifications.onlyWhenHidden,
      sound: DEFAULT_CONFIG.notifications.sound,
      onQuestion: DEFAULT_CONFIG.notifications.onQuestion,
    },
  })
  assert.deepEqual(normalizeConfig({ notifications: 'nope' }).notifications, {
    enabled: true,
    onlyWhenHidden: true,
    sound: 'chime',
    onQuestion: true,
  })
})

await check('non-boolean fields fall back instead of leaking through', () => {
  const normalized = normalizeConfig({ notifications: { enabled: 'yes', onlyWhenHidden: 0 } })
  assert.equal(normalized.notifications.enabled, true)
  assert.equal(normalized.notifications.onlyWhenHidden, true)
  assert.equal(normalized.notifications.sound, 'chime')
  assert.equal(normalized.notifications.onQuestion, true)
})

const file = join(scratch, 'state', 'config.json')
const store = new ConfigStore({ file })

await check('an unwritten store answers the defaults', () => {
  const config = store.get()
  assert.equal(config.notifications.enabled, true)
  assert.equal(config.notifications.onlyWhenHidden, true)
})

await check('the sound kind is validated and migrates the old boolean', () => {
  const before = store.get().notifications
  assert.equal(normalizeConfig({ notifications: { sound: true } }).notifications.sound, 'chime', 'legacy true')
  assert.equal(normalizeConfig({ notifications: { sound: false } }).notifications.sound, 'off', 'legacy false')
  assert.equal(normalizeConfig({ notifications: { sound: 'nope' } }).notifications.sound, 'chime', 'unknown falls back')
  const config = store.set({ notifications: { sound: 'mcdonalds' } })
  assert.equal(config.notifications.sound, 'mcdonalds')
  assert.equal(config.notifications.enabled, before.enabled, 'the other flags keep their value')
  assert.equal(config.notifications.onlyWhenHidden, before.onlyWhenHidden)
  store.set({ notifications: { sound: 'chime' } })
})

await check('a patch merges and persists only the given field', () => {
  const config = store.set({ notifications: { enabled: false } })
  assert.equal(config.notifications.enabled, false)
  assert.equal(config.notifications.onlyWhenHidden, true, 'the untouched field survives')
  assert.equal(config.notifications.sound, 'chime', 'and so does the sound kind')
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.notifications.enabled, false)
  assert.equal(onDisk.version, 1)
})

await check('a second store reads what the first wrote', () => {
  const reopened = new ConfigStore({ file })
  assert.equal(reopened.get().notifications.enabled, false)
})

await check('an external edit is picked up on the next read', async () => {
  const external = { version: 1, notifications: { enabled: true, onlyWhenHidden: false } }
  writeFileSync(file, `${JSON.stringify(external, null, 2)}\n`, 'utf8')
  // mtime resolution: make the change unambiguous
  await new Promise((resolve) => setTimeout(resolve, 12))
  writeFileSync(file, `${JSON.stringify({ ...external, notifications: { ...external.notifications, enabled: false } }, null, 2)}\n`, 'utf8')
  assert.equal(store.get().notifications.enabled, false)
  assert.equal(store.get().notifications.onlyWhenHidden, false)
})

await check('a corrupt file falls back to the defaults', () => {
  writeFileSync(file, '{not json', 'utf8')
  const broken = new ConfigStore({ file })
  assert.equal(broken.get().notifications.enabled, true)
})

rmSync(scratch, { recursive: true, force: true })
console.log(`\n${passed} checks passed`)
