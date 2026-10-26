/**
 * Checks for the browser half: the tab registers into `conversation.view` with
 * the right identity, the inject face resolves the host's folder chooser, and
 * the component renders the state the host route returns and mutates through it.
 *
 * Run: node test/client.test.mjs
 */
import assert from 'node:assert/strict'

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      captured = entry
    },
  },
}

// ---- minimal React stand-in ----------------------------------------------
const createReact = () => {
  const slots = []
  let index = 0
  return {
    __slots: slots,
    reset() {
      index = 0
    },
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useState(initial) {
      const slot = index++
      if (!(slot in slots)) slots[slot] = { value: typeof initial === 'function' ? initial() : initial }
      return [
        slots[slot].value,
        (next) => {
          slots[slot].value = typeof next === 'function' ? next(slots[slot].value) : next
        },
      ]
    },
    useEffect(effect) {
      index += 1
      effect()
    },
    useCallback(callback) {
      index += 1
      return callback
    },
    useRef(initial) {
      const slot = index++
      if (!(slot in slots)) slots[slot] = { current: initial }
      return slots[slot]
    },
  }
}

const impl = { current: createReact() }
const resetRender = () => impl.current.reset()
const resetState = () => { impl.current = createReact() }
const React = {
  createElement: (...args) => impl.current.createElement(...args),
  useState: (...args) => impl.current.useState(...args),
  useEffect: (...args) => impl.current.useEffect(...args),
  useCallback: (...args) => impl.current.useCallback(...args),
  useRef: (...args) => impl.current.useRef(...args),
}

const en = {}
const zh = {}
const locale = {
  register(ns, dicts) {
    Object.assign(en, dicts.en)
    Object.assign(zh, dicts.zh)
    return () => {}
  },
  bind() {
    return (key, values) => {
      const template = zh[key] ?? key
      if (values === undefined) return template
      return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
    }
  },
}

const pickerCalls = []
const registrations = []
const clientCtx = {
  effect(fn) {
    return fn()
  },
  locale,
  get(name) {
    if (name === 'uiWorkspace') {
      return {
        async pickDirectory() {
          pickerCalls.push(true)
          return 'C:\\picked\\dir'
        },
      }
    }
    return undefined
  },
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

await import('../client.js')

let passed = 0
const check = async (label, fn) => {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

await check('the module loads under the package id', () => {
  assert.ok(captured !== null, 'factory registered')
  assert.equal(captured.id, 'dsh-ezuse')
})

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

await check('the plugin declares the slots and locale services', () => {
  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')
})

plugin.apply(clientCtx)

const byName = (slot) => registrations.find((registration) => registration.options.name === slot)

await check('one tab is registered into conversation.view', () => {
  const { options } = byName('conversation.view')
  assert.equal(options.name, 'conversation.view')
  assert.equal(options.id, 'ezuse-roots')
  assert.equal(options.order, 20)
  assert.equal(options.locale, 'dsh-ezuse.roots')
})

await check('the tab label is localized', () => {
  const { options } = byName('conversation.view')
  assert.equal(typeof options.label, 'function')
  assert.equal(options.label(), '项目目录')
  assert.equal(zh.tab, '项目目录')
  assert.equal(en.tab, 'Project directories')
})

await check('the inject face resolves the host folder chooser', async () => {
  const face = byName('conversation.view').options.inject()
  const picked = await face.pickDirectory()
  assert.equal(picked, 'C:\\picked\\dir')
  assert.equal(pickerCalls.length, 1)
})

// ---- rendering -----------------------------------------------------------
const state = {
  ok: true,
  primary: 'C:\\work\\main',
  roots: [
    { path: 'C:\\work\\api', exists: true },
    { path: 'C:\\work\\gone', exists: false },
  ],
  fence: true,
  shell: { supported: true, granted: 2 },
}
const requests = []
let configValue = { version: 1, notifications: { enabled: true, onlyWhenHidden: true, sound: 'chime' } }
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init })
  if (String(url).split('?')[0] === '/ezuse/session') {
    return {
      ok: true,
      async json() {
        return { ok: true, session: 'session-test', title: '多工作区插件开发', primary: 'C:\\work\\main', workspace: 'main', mode: 'workspace-write' }
      },
    }
  }
  if (String(url).split('?')[0] === '/ezuse/config') {
    if (init?.method === 'POST') {
      const patch = JSON.parse(init.body)
      configValue = { ...configValue, notifications: { ...configValue.notifications, ...(patch.notifications ?? {}) } }
    }
    return { ok: true, async json() { return { ok: true, config: configValue } } }
  }
  if (init === undefined || init.method === undefined) return { async json() { return state } }
  const body = JSON.parse(init.body)
  if (body.action === 'add') {
    return {
      async json() {
        return { ...state, roots: [...state.roots, { path: body.path, exists: true }], added: true }
      },
    }
  }
  if (body.action === 'remove') {
    return { async json() { return { ...state, roots: state.roots.filter((row) => row.path !== body.path) } } }
  }
  return { async json() { return { ...state, roots: [] } } }
}

/** Flatten an element tree into text for assertions. */
const textOf = (node) => {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children)
}

/** Find the first element whose subtree contains the given text. */
const findByText = (node, needle) => {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined
  if (textOf(node).includes(needle)) {
    for (const child of node.children ?? []) {
      if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
        const deeper = findByText(child, needle)
        if (deeper !== undefined) return deeper
      }
    }
    return node
  }
  return undefined
}

/** Every element in the tree, depth first. */
const collect = (node, out = []) => {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out)
    return out
  }
  if (node === null || typeof node !== 'object') return out
  out.push(node)
  for (const child of node.children ?? []) collect(child, out)
  return out
}

const component = byName('conversation.view').component
const props = {
  sessionId: 'session-test',
  t: (key, values) => {
    const template = zh[key] ?? key
    if (values === undefined) return template
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
  },
  ...byName('conversation.view').options.inject(),
}

resetRender()
const first = component(props)
await new Promise((resolve) => setTimeout(resolve, 0))
resetRender()
const second = component(props)

await check('the first paint is a loading state', () => {
  assert.match(textOf(first), /正在读取/)
})

await check('the mounted view lists the workspace and every extra root', () => {
  const text = textOf(second)
  assert.match(text, /项目目录/)
  assert.match(text, /C:\\work\\main/)
  assert.match(text, /C:\\work\\api/)
  assert.match(text, /C:\\work\\gone/)
  assert.match(text, /目录不存在/)
  assert.match(text, /已对附加目录生效/)
  assert.match(text, /shell 写入：已生效（2 个目录已授权）/)
})

await check('the view reads through the plugin route for its session', () => {
  assert.ok(requests.length > 0)
  assert.equal(requests[0].url, '/ezuse/roots?session=session-test')
})

await check('「移除」 posts a remove for that exact directory', async () => {
  const row = collect(second).find(
    (element) =>
      typeof element.props.className === 'string' &&
      element.props.className.includes('ezuse-roots__row') &&
      textOf(element).includes('C:\\work\\gone'),
  )
  assert.ok(row, 'the row for the missing directory is rendered')
  const button = collect(row).find(
    (element) => typeof element.props.onClick === 'function' && textOf(element).includes('移除'),
  )
  assert.ok(button, 'remove button found in the row')
  await button.props.onClick()
  const post = requests.find((request) => request.init?.method === 'POST')
  assert.ok(post, 'a POST was issued')
  assert.equal(post.init.headers['x-dsh-ezuse'], '1')
  assert.deepEqual(JSON.parse(post.init.body), { session: 'session-test', action: 'remove', path: 'C:\\work\\gone' })
})

await check('「添加目录」 picks a folder and posts it', async () => {
  resetRender()
  const view = component(props)
  const addButton = findByText(view, '添加目录')
  assert.ok(addButton, 'add button found')
  await addButton.props.onClick()
  const post = requests.filter((request) => request.init?.method === 'POST').pop()
  assert.deepEqual(JSON.parse(post.init.body), { session: 'session-test', action: 'add', path: 'C:\\picked\\dir' })
})

await check('a host failure renders as an error rather than blank space', async () => {
  resetState()
  const saved = globalThis.fetch
  globalThis.fetch = async () => ({ async json() { return { ok: false, error: '会话未在运行' } } })
  resetRender()
  const failed = component(props)
  await new Promise((resolve) => setTimeout(resolve, 0))
  resetRender()
  const rendered = component(props)
  globalThis.fetch = saved
  assert.match(textOf(rendered), /读取目录状态失败：会话未在运行/)
  assert.ok(failed)
})

await check('a missing host route renders the restart hint instead of a raw error', async () => {
  resetState()
  const saved = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 404, async json() { return {} } })
  resetRender()
  component(props)
  await new Promise((resolve) => setTimeout(resolve, 0))
  resetRender()
  const rendered = component(props)
  globalThis.fetch = saved
  assert.match(textOf(rendered), /重启 DSH 后刷新页面/)
})

// ---- settings page -------------------------------------------------------
await check('an EZUSE section is registered in settings.section', () => {
  const section = byName('settings.section')
  assert.ok(section, 'settings section registered')
  assert.equal(section.options.id, 'ezuse')
  assert.equal(section.options.order, 25)
  assert.equal(section.options.label(), 'EZUSE')
})

await check('a renderless watcher and a toast are registered app-wide', () => {
  const overlays = registrations.filter((registration) => registration.options.name === 'shell.overlay')
  assert.deepEqual(
    overlays.map((registration) => registration.options.id).sort(),
    ['ezuse-notify', 'ezuse-toast'],
  )
})

await check('a workspace-level panel and its sidebar icon are registered', () => {
  const panel = registrations.find((registration) => registration.options.name === 'main')
  assert.ok(panel, 'main panel registered')
  assert.equal(panel.options.key, 'ezuse')
  const icon = byName('sidebar.panellist')
  assert.ok(icon, 'panel icon registered')
  assert.equal(icon.options.id, 'ezuse')
  assert.equal(icon.options.label(), '项目目录')
})

const settingsComponent = byName('settings.section').component
const settingsProps = {
  t: (key, values) => {
    const template = zh[key] ?? key
    if (values === undefined) return template
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
  },
  close: () => {},
}

resetState()
resetRender()
settingsComponent(settingsProps)
await new Promise((resolve) => setTimeout(resolve, 0))
resetRender()
const settingsView = settingsComponent(settingsProps)

await check('the panel lists every workspace and mounts into the chosen one', async () => {
  const panel = registrations.find((registration) => registration.options.name === 'main').component
  const items = [
    { workspaceId: 'w1', title: '主仓库', path: 'C:\\work\\main', sessionIds: [] },
    { workspaceId: 'w2', title: '后端', path: 'C:\\work\\backend', sessionIds: [] },
  ]
  const panelProps = {
    useWorkspaces: (selector) => selector({ items }),
    pickDirectory: async () => 'C:\\picked\\extra',
  }
  const saved = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    if (String(url).split('?')[0] === '/ezuse/workspaces') {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            workspaces: [
              { title: '主仓库', path: 'C:\\work\\main', roots: [{ path: 'C:\\work\\api', exists: true }] },
              { title: '后端', path: 'C:\\work\\backend', roots: [] },
            ],
          }
        },
      }
    }
    return { ok: true, async json() { return { ok: true, added: true } } }
  }
  resetState()
  resetRender()
  panel(panelProps)
  await new Promise((resolve) => setTimeout(resolve, 0))
  resetRender()
  const view = panel(panelProps)
  const text = textOf(view)
  assert.match(text, /项目目录/)
  assert.match(text, /主仓库/)
  assert.match(text, /C:\\work\\api/)
  assert.match(text, /后端/)
  const buttons = collect(view).filter((element) => typeof element.props.onClick === 'function' && textOf(element) === '挂载目录…')
  assert.equal(buttons.length, 2, 'one mount button per workspace')
  requests.length = 0
  await buttons[1].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const post = requests.find((request) => request.init?.method === 'POST')
  assert.deepEqual(JSON.parse(post.init.body), { workspace: 'C:\\work\\backend', action: 'add', path: 'C:\\picked\\extra' })
  globalThis.fetch = saved
})

await check('a panel mount reports itself through the toast', () => {
  const toast = registrations
    .filter((registration) => registration.options.name === 'shell.overlay')
    .find((registration) => registration.options.id === 'ezuse-toast')
  resetState()
  resetRender()
  assert.match(textOf(toast.component()), /已挂载 C:\\picked\\extra/)
})

await check('the page shows the notification switches', () => {
  const text = textOf(settingsView)
  assert.match(text, /EZUSE/)
  assert.match(text, /对话完成时提醒我/)
  assert.match(text, /仅当 DSH 页面不可见时提醒/)
  assert.match(text, /浏览器通知权限/)
  const switches = collect(settingsView).filter((element) => element.props.role === 'switch')
  assert.equal(switches.length, 3, 'enabled, onlyWhenHidden and onQuestion')
  assert.ok(
    switches.some((element) => element.props['aria-label'] === 'notify-question'),
    'the question switch is rendered',
  )
  assert.equal(switches[0].props['aria-checked'], 'true')
  const select = collect(settingsView).find((element) => element.props['aria-label'] === 'notify-sound')
  assert.ok(select, 'the sound picker is rendered')
  assert.equal(select.props.value, 'chime', 'the chime is the default')
  const options = collect(select).filter((element) => element.type === 'option').map((element) => element.props.value)
  assert.deepEqual(options, ['chime', 'mcdonalds', 'off'])
})

await check('toggling a switch posts the patch to the plugin route', async () => {
  const switches = collect(settingsView).filter((element) => element.props.role === 'switch')
  await switches[0].props.onClick()
  const post = requests.filter((request) => request.init?.method === 'POST').pop()
  assert.equal(post.url, '/ezuse/config')
  assert.equal(post.init.headers['x-dsh-ezuse'], '1')
  assert.deepEqual(JSON.parse(post.init.body), { notifications: { enabled: false } })
})

// ---- completion notification --------------------------------------------
const fired = []
class FakeNotification {
  constructor(title, options) {
    this.listeners = new Map()
    this.title = title
    this.options = options
    this.closed = false
    fired.push(this)
  }
  static permission = 'granted'
  static requestPermission() {
    return Promise.resolve('granted')
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener)
  }
  close() {
    this.closed = true
  }
}
globalThis.Notification = FakeNotification
globalThis.document = { visibilityState: 'hidden' }

// A harmless AudioContext stand-in: the chime must go through it, not through
// the OS, so it is testable without sound devices.
const tones = []
class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.currentTime = 0
    this.destination = {}
  }
  createOscillator() {
    const tone = { kind: 'start', frequency: 0, start: 0, stop: 0 }
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      connect: (node) => node,
      start: (at) => {
        tone.frequency = osc.frequency.value
        tone.start = at ?? 0
        tones.push(tone)
      },
      stop: (at) => {
        tone.stop = at ?? 0
      },
    }
    return osc
  }
  createGain() {
    return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (node) => node }
  }
  resume() {
    return Promise.resolve()
  }
}
globalThis.window.AudioContext = FakeAudioContext

const sentinel = byName('shell.overlay').component
const opened = []
const sentinelProps = (holder) => ({
  sessionId: 'session-test',
  openSession: (id) => opened.push(id),
  useSessionStatus: (selector) => selector(new Map([['session-test', holder.status]])),
})

await check('a finished turn fires one browser notification', async () => {
  // The previous check switched notifications off; switch them back on through
  // the page so the shared cache the watcher reads is updated the same way.
  // Fresh slots so the page reads the *published* config rather than its own
  // stale render state.
  resetState()
  resetRender()
  const switchesAgain = collect(settingsComponent(settingsProps)).filter((element) => element.props.role === 'switch')
  await switchesAgain[0].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(configValue.notifications.enabled, true)
  fired.length = 0
  tones.length = 0
  const holder = { status: { running: true, completionUnread: false } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: false, completionUnread: true }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 1)
  assert.equal(tones.length, 2, 'two chime notes accompany the notification')
  assert.deepEqual(tones.map((tone) => Math.round(tone.frequency)), [880, 1175])
  assert.equal(fired[0].title, '多工作区插件开发', 'the title names the session')
  assert.match(fired[0].options.body, /main/)
  assert.match(fired[0].options.body, /这一轮已经结束/)
  assert.match(fired[0].options.tag, /^ezuse-session-test-\d+$/, 'a unique tag lets each completion pop')
  fired[0].listeners.get('click')()
  assert.deepEqual(opened, ['session-test'], 'clicking the notification returns to that session')
  assert.equal(fired[0].closed, true)
})

await check('a visible window stays quiet', async () => {
  globalThis.document.visibilityState = 'visible'
  fired.length = 0
  const holder = { status: { running: true, completionUnread: false } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: false, completionUnread: true }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 0, 'onlyWhenHidden suppresses it')
  globalThis.document.visibilityState = 'hidden'
})

await check('picking the motif writes it and the preview plays it', async () => {
  resetState()
  resetRender()
  const view = settingsComponent(settingsProps)
  const select = collect(view).find((element) => element.props['aria-label'] === 'notify-sound')
  assert.ok(select, 'the sound picker is rendered')
  requests.length = 0
  await select.props.onChange({ target: { value: 'mcdonalds' } })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const post = requests.filter((request) => request.init?.method === 'POST').pop()
  assert.deepEqual(JSON.parse(post.init.body), { notifications: { sound: 'mcdonalds' } })
  assert.equal(configValue.notifications.sound, 'mcdonalds')

  // the preview plays the chosen motif: 6̲ 7̲ 1 6 5 → A4 B4 C5 A5 G5
  tones.length = 0
  resetState()
  resetRender()
  const rendered = settingsComponent(settingsProps)
  const preview = collect(rendered).find(
    (element) => element.props.className === 'ezuse-settings__button' && textOf(element) === '试听',
  )
  assert.ok(preview, 'the preview button is rendered')
  preview.props.onClick()
  assert.deepEqual(tones.map((tone) => Math.round(tone.frequency)), [440, 494, 523, 880, 784])
  // the closing 5 is held 0.55 s: noticeably longer than the 0.15 s run,
  // but half of the original 1.1 s hold
  const lengths = tones.map((tone) => Number((tone.stop - tone.start).toFixed(2)))
  assert.deepEqual(lengths, [0.17, 0.17, 0.17, 0.17, 0.57])
})

await check('the test notification plays the configured motif too', () => {
  // "Test works but the real notification is silent" must not be possible: the
  // test button exercises the same sound path.
  resetState()
  resetRender()
  const view = settingsComponent(settingsProps)
  const send = collect(view).find(
    (element) => element.props.className === 'ezuse-settings__button' && textOf(element) === '发送',
  )
  assert.ok(send, 'the send button is rendered')
  tones.length = 0
  fired.length = 0
  send.props.onClick()
  assert.deepEqual(tones.map((tone) => Math.round(tone.frequency)), [440, 494, 523, 880, 784])
  assert.equal(fired.length, 1, 'and it still pops a notification')
})

await check('switching to another browser tab still counts as "not in foreground"', async () => {
  // `document.visibilityState` is 'hidden' whenever this tab is not the one on
  // screen — another tab, a minimised window, another app. All of those must
  // still notify, otherwise "only when hidden" would mean "never in a browser".
  for (const state of ['hidden']) {
    globalThis.document.visibilityState = state
    fired.length = 0
    const holder = { status: { running: true, completionUnread: false } }
    resetState()
    resetRender()
    sentinel(sentinelProps(holder))
    holder.status = { running: false, completionUnread: true }
    resetRender()
    sentinel(sentinelProps(holder))
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(fired.length, 1, `a ${state} tab must still notify`)
  }
  globalThis.document.visibilityState = 'visible'
})

await check('a question from the model notifies with the question text', async () => {
  globalThis.document.visibilityState = 'hidden'
  fired.length = 0
  tones.length = 0
  const question = { key: 'q-1', kind: 'question', sessionId: 'session-test', questions: [{ id: 'a', question: '要部署到测试环境还是生产环境？' }] }
  const holder = { status: { running: true, completionUnread: false, pendingInteraction: undefined } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: true, completionUnread: false, pendingInteraction: question }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 1, 'the question pops a notification')
  assert.equal(fired[0].title, '多工作区插件开发', 'named after the session')
  assert.match(fired[0].options.body, /等你回答/)
  assert.match(fired[0].options.body, /部署到测试环境还是生产环境/)
  assert.equal(tones.length, 5, 'and it plays the motif')
})

await check('the same pending question does not notify twice', async () => {
  globalThis.document.visibilityState = 'hidden'
  fired.length = 0
  const question = { key: 'q-1', kind: 'question', sessionId: 'session-test', questions: [{ id: 'a', question: '要部署到测试环境还是生产环境？' }] }
  const holder = { status: { running: true, completionUnread: false, pendingInteraction: undefined } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: true, completionUnread: false, pendingInteraction: question }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 1)
  // the status re-renders with the identical request still pending
  for (let tick = 0; tick < 3; tick += 1) {
    resetRender()
    sentinel(sentinelProps(holder))
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 1, 'no duplicate for the same request key')
})

await check('a second, different question notifies again', async () => {
  globalThis.document.visibilityState = 'hidden'
  fired.length = 0
  const first = { key: 'q-1', kind: 'question', sessionId: 'session-test', questions: [{ id: 'a', question: '第一个问题' }] }
  const second = { key: 'q-2', kind: 'question', sessionId: 'session-test', questions: [{ id: 'b', question: '第二个问题' }] }
  const holder = { status: { running: true, completionUnread: false, pendingInteraction: undefined } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: true, completionUnread: false, pendingInteraction: first }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  holder.status = { running: true, completionUnread: false, pendingInteraction: second }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 2, 'a replacement request is a new edge')
  assert.match(fired[1].options.body, /第二个问题/)
})

await check('approval prompts are not treated as questions', async () => {
  globalThis.document.visibilityState = 'hidden'
  fired.length = 0
  const approval = { key: 'a-1', kind: 'approval', sessionId: 'session-test' }
  const holder = { status: { running: true, completionUnread: false, pendingInteraction: undefined } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  holder.status = { running: true, completionUnread: false, pendingInteraction: approval }
  resetRender()
  sentinel(sentinelProps(holder))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fired.length, 0, 'only the model asking is a question')
})

await check('nothing fires while the agent is still running', async () => {
  fired.length = 0
  const holder = { status: { running: true, completionUnread: false } }
  resetState()
  resetRender()
  sentinel(sentinelProps(holder))
  resetRender()
  sentinel(sentinelProps(holder))
  assert.equal(fired.length, 0)
})

console.log(`\n${passed} checks passed`)
