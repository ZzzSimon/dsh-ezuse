/**
 * dsh-ezuse — ergonomics for the DeepSeek Harness.
 *
 * Feature 1: multi-root workspace ("多工作区").
 *
 * The harness gives one session exactly one workspace directory: the immutable
 * `SessionHeader.cwd` is the `workspace-write` boundary, the shell's write grant
 * and the filesystem fence all derive from it. Work that spans several folders —
 * an API and its client, a library plus a scratch dir — therefore needs one
 * directory to be the session's home and the others to be *mounted beside it*.
 *
 * This plugin mounts them:
 *  - the extra directories are recorded per workspace directory (durable JSON,
 *    see `./lib/store.js`), so every session started in the same directory —
 *    resumed, forked, or a second window — sees the same set;
 *  - file tools may write there because `./lib/fence.js` replays the shipped
 *    fence with that root as its workspace root;
 *  - `pwsh`-family calls may write there because `./lib/grants.js` gives the
 *    session's per-workspace capability SID a Write ACE on that root;
 *  - the model is told the roots in one runtime-context line, and the user
 *    manages them with `/workspace`, whose `add` without an argument opens the
 *    host's own folder chooser.
 *
 * Nothing is widened for `read-only` sessions, and a denial outside every root
 * still comes from the shipped sandbox with its own message and escalation hint.
 */
import { promises as fsp } from 'node:fs'
import { basename, resolve as resolvePath } from 'node:path'
import { canonicalPath, samePath, pathKey, resolveDirectory } from './lib/paths.js'
import { RootsStore, resolveStoreFile } from './lib/store.js'
import { installFsFence } from './lib/fence.js'
import { createGrantManager } from './lib/grants.js'
import { installRoutes } from './lib/http.js'
import { ConfigStore, resolveConfigFile } from './lib/config.js'

const COMMAND_NAME = 'workspace'
const CONTEXT_NAME = 'ezuse:workspace-roots'
/** Immediately after the sandbox policy context (110), before approval policy (115). */
const CONTEXT_ORDER = 112

const USAGE = [
  '多工作区：让当前会话同时挂载多个目录。',
  '/workspace            查看主工作区与附加目录',
  '/workspace add        打开文件夹选择框并加入',
  '/workspace add <路径> 直接加入一个已存在的目录',
  '/workspace remove <序号|路径>  移除附加目录',
  '/workspace clear      清空附加目录',
].join('\n')

/**
 * Read one optional service without tripping over cordis' missing-service
 * diagnostics on a composition that does not mount it.
 * @param {object} ctx - host context.
 * @param {string} name - service key.
 * @returns {unknown} the service, or `undefined`.
 */
function serviceOf(ctx, name) {
  try {
    const value = ctx.get?.(name)
    if (value !== undefined && value !== null) return value
  } catch {
    /* fall through to the property access */
  }
  try {
    const value = ctx[name]
    return value ?? undefined
  } catch {
    return undefined
  }
}

/**
 * One model-facing runtime-context line, or `''` when this workspace has no
 * extra roots (an empty text contributes nothing to the snapshot).
 * @param {string} primary - the session's workspace directory.
 * @param {readonly string[]} roots - canonical extra roots.
 * @returns {string} the context text.
 */
function renderPromptContext(primary, roots) {
  if (!Array.isArray(roots) || roots.length === 0) return ''
  const listed = roots.map((root) => JSON.stringify(root)).join(', ')
  return (
    `Additional workspace roots are mounted for this session and are writable under the current file policy: ${listed}. ` +
    `The session workspace stays ${JSON.stringify(primary)}: relative paths resolve there, so address these roots with absolute paths.`
  )
}

/**
 * Human-facing list of the mounted roots with their live status.
 * @param {string} primary - the session's workspace directory.
 * @param {readonly string[]} roots - canonical extra roots.
 * @param {{ fence: boolean, grants: { supported: boolean, granted: number, reason?: string } }} state - enforcement facts.
 * @returns {Promise<string>} the rendered result text.
 */
async function renderList(primary, roots, state) {
  const lines = [`主工作区：${primary}`]
  if (roots.length === 0) {
    lines.push('附加目录：无')
  } else {
    lines.push(`附加目录（${roots.length}）：`)
    for (const [index, root] of roots.entries()) {
      let note = ''
      try {
        const info = await fsp.stat(root)
        if (!info.isDirectory()) note = '  ⚠ 不是目录'
      } catch {
        note = '  ⚠ 目录不存在'
      }
      lines.push(`  ${index + 1}. ${root}${note}`)
    }
  }
  lines.push(`文件写入：${state.fence ? '已对附加目录生效' : '未生效（未找到文件服务，仅供读取）'}`)
  lines.push(
    state.grants.supported
      ? state.grants.pending
        ? 'shell 写入：正在授权（首次挂载大目录要遍历整棵树，期间不影响其它操作）'
        : `shell 写入：已生效（${state.grants.granted} 个目录已获得 Windows ACL 授权）`
      : `shell 写入：未生效（${state.grants.reason ?? '未知原因'}）`,
  )
  lines.push('提示：/workspace add 打开文件夹选择框；/workspace remove <序号> 移除。')
  return lines.join('\n')
}

/**
 * What a notification needs to name the session it is about: its title, its
 * workspace directory, and the file-effect mode it runs under.
 * @param {object} ctx - host context (optional `agents`, `sessionTitle`, `sandboxPolicy`).
 * @param {string} sessionId - the session to describe.
 * @returns {{ ok: boolean, session?: string, title?: string, primary?: string, workspace?: string, mode?: string, error?: string }} the wire facts.
 */
function describeSession(ctx, sessionId) {
  const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
  const session = agent?.session
  if (session === undefined) return { ok: false, error: '会话未在运行，无法读取会话信息' }
  let title
  try {
    const snapshot = serviceOf(ctx, 'sessionTitle')?.get?.(session)
    if (snapshot !== undefined && snapshot !== null && typeof snapshot.title === 'string') title = snapshot.title
  } catch {
    /* a missing title service only costs us the nicer wording */
  }
  const cwd = session.header?.cwd
  const primary = typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
  return {
    ok: true,
    session: sessionId,
    title,
    primary,
    workspace: primary === undefined ? undefined : basename(primary),
    mode: sessionMode(ctx, sessionId),
  }
}

/**
 * The workspace directory of one live session.
 * @param {object} ctx - host context (optional `agents`).
 * @param {string} sessionId - the session to resolve.
 * @returns {string | undefined} its immutable cwd, or `undefined` when the session is not live or has none.
 */
function sessionCwd(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * The file-effect mode the session currently runs under, when the policy service
 * is mounted.
 * @param {object} ctx - host context (optional `sandboxPolicy`, `agents`).
 * @param {string} sessionId - the session to resolve.
 * @returns {'read-only' | 'workspace-write' | 'danger-full-access' | undefined} the effective mode.
 */
function sessionMode(ctx, sessionId) {
  const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
  const session = agent?.session
  if (session === undefined) return undefined
  try {
    return serviceOf(ctx, 'sandboxPolicy')?.resolve?.({ session })?.mode
  } catch {
    return undefined
  }
}

/**
 * The state the 项目目录 tab renders: primary directory, mounted roots with a
 * live existence flag, and which enforcement is actually in force.
 * @param {object} ctx - host context.
 * @param {ReturnType<typeof createService>} service - the plugin's service object.
 * @param {string} sessionId - the session the tab belongs to.
 * @returns {Promise<object>} the wire snapshot.
 */
async function describeWorkspace(ctx, service, sessionId) {
  const primary = sessionCwd(ctx, sessionId)
  if (primary === undefined) return { ok: false, error: '会话未在运行，无法读取工作区目录' }
  // The ACE is a capability, not a promise: it only decides anything while the
  // session runs confined. Reporting the mode keeps the panel from claiming
  // "shell writes enabled" in a session that is read-only or unrestricted.
  const mode = sessionMode(ctx, sessionId)
  const roots = service.rootsOf(primary)
  // Re-state the desired grant on every read, but only where it can matter.
  // Standing ACEs make this ~1 ms when they already exist, and it keeps the
  // report honest after a reload, when this generation's memory of what it
  // granted is empty while the ACE is still there.
  void service.apply(primary, roots, { grant: mode === 'workspace-write' })
  const rows = []
  for (const root of roots) {
    let exists = true
    try {
      const info = await fsp.stat(root)
      exists = info.isDirectory()
    } catch {
      exists = false
    }
    rows.push({ path: root, exists })
  }
  const state = service.state()
  return {
    ok: true,
    session: sessionId,
    primary,
    roots: rows,
    fence: state.fence,
    mode,
    shell: state.grants,
  }
}

/**
 * Every registered workspace with its extra roots — the 项目目录 panel manages
 * all of them at once, because a workspace can have no live session.
 * @param {object} ctx - host context (optional `workspaceRegistry`).
 * @param {ReturnType<typeof createService>} service - the plugin's service object.
 * @returns {Promise<object>} the wire snapshot.
 */
async function describeWorkspaces(ctx, service) {
  const registry = serviceOf(ctx, 'workspaceRegistry')
  let list = []
  try {
    list = typeof registry?.list === 'function' ? registry.list() : []
  } catch {
    list = []
  }
  const workspaces = []
  for (const workspace of list) {
    const roots = service.rootsOf(workspace.path)
    const rows = []
    for (const root of roots) {
      let exists = true
      try {
        const info = await fsp.stat(root)
        exists = info.isDirectory()
      } catch {
        exists = false
      }
      rows.push({ path: root, exists })
    }
    workspaces.push({ title: workspace.title, path: workspace.path, roots: rows })
  }
  const state = service.state()
  return { ok: true, workspaces, fence: state.fence, shell: state.grants }
}

/**
 * A live session that runs in the given workspace directory, if any — it decides
 * whether a shell grant is worth writing for that workspace.
 * @param {object} ctx - host context (optional `agents`).
 * @param {string} workspacePath - canonical workspace directory.
 * @returns {object | undefined} the live session.
 */
function liveSessionIn(ctx, workspacePath) {
  let agents = []
  try {
    agents = serviceOf(ctx, 'agents')?.list?.() ?? []
  } catch {
    agents = []
  }
  const key = pathKey(workspacePath)
  for (const agent of agents) {
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd === 'string' && pathKey(cwd) === key) return agent.session
  }
  return undefined
}

/**
 * One mutation from the tab, then the refreshed snapshot.
 * @param {object} ctx - host context.
 * @param {ReturnType<typeof createService>} service - the plugin's service object.
 * @param {string} sessionId - the session the tab belongs to.
 * @param {string} action - `add`, `remove`, or `clear`.
 * @param {unknown} path - the directory argument for `add` and `remove`.
 * @returns {Promise<object>} the refreshed snapshot, or `{ ok: false, error }`.
 */
/** The store + grant core shared by the session route and the workspace route. */
async function mutateRoots(service, primary, action, path, grant) {
  if (action === 'add') {
    const resolved = await resolveDirectory(typeof path === 'string' ? path : '', primary)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    if (samePath(resolved.path, primary)) return { ok: false, error: '该目录就是主工作区，无需重复挂载' }
    const { added, roots } = service.store.add(primary, resolved.path)
    service.apply(primary, roots, { grant })
    return { ok: true, added }
  }
  if (action === 'remove') {
    if (typeof path !== 'string' || path.length === 0) return { ok: false, error: '缺少要移除的目录' }
    const { removed, roots } = service.store.remove(primary, path)
    service.apply(primary, roots, { grant })
    return { ok: true, removed }
  }
  if (action === 'clear') {
    const { roots } = service.store.clear(primary)
    service.apply(primary, [], { grant })
    return { ok: true, cleared: roots.length }
  }
  return { ok: false, error: `未知操作：${action}` }
}

async function mutateWorkspace(ctx, service, sessionId, action, path) {
  const primary = sessionCwd(ctx, sessionId)
  if (primary === undefined) return { ok: false, error: '会话未在运行，无法修改工作区目录' }
  const result = await mutateRoots(service, primary, action, path, sessionMode(ctx, sessionId) === 'workspace-write')
  if (result.ok !== true) return result
  const snapshot = await describeWorkspace(ctx, service, sessionId)
  return { ...snapshot, ...result }
}

/**
 * The same mutation addressed by a workspace directory instead of a session —
 * the 项目目录 panel manages workspaces that may have no live session.
 * @param {object} ctx - host context.
 * @param {ReturnType<typeof createService>} service - the plugin's service object.
 * @param {string} workspacePath - absolute workspace directory.
 * @param {string} action - `add`, `remove`, or `clear`.
 * @param {unknown} path - the directory argument.
 * @returns {Promise<object>} the mutation outcome.
 */
async function mutateByWorkspace(ctx, service, workspacePath, action, path) {
  const requested = typeof workspacePath === 'string' ? workspacePath.trim() : ''
  if (requested.length === 0) return { ok: false, error: '缺少工作区目录' }
  const primary = canonicalPath(requested)
  const session = liveSessionIn(ctx, primary)
  let grant = false
  if (session !== undefined) {
    try {
      grant = serviceOf(ctx, 'sandboxPolicy')?.resolve?.({ session })?.mode === 'workspace-write'
    } catch {
      grant = false
    }
  }
  return mutateRoots(service, primary, action, path, grant)
}

/**
 * The plugin's own view of the world, shared by the command, the prompt and the
 * enforcement hooks.
 * @param {object} ctx - host context.
 */
function createService(ctx) {
  const store = new RootsStore({ file: resolveStoreFile(), logger: ctx.logger })
  const config = new ConfigStore({ file: resolveConfigFile(), logger: ctx.logger })
  const rootsOf = (workspaceRoot) => store.list(workspaceRoot)
  const grants = createGrantManager(ctx)

  const state = () => {
    const fsService = serviceOf(ctx, 'fs')
    return {
      fence: typeof fsService?.writeText === 'function' && typeof fsService?.editText === 'function',
      grants: grants.status(),
    }
  }

  /**
   * Declare the roots one workspace should have, and the promise that settles
   * when the grant attempt finished (callers that need the ACE await it).
   * @param {string} workspaceRoot - the session's cwd.
   * @param {readonly string[]} roots - canonical extra roots.
   * @param {{ grant?: boolean }} [options] - `grant: false` skips writing ACEs.
   */
  const apply = (workspaceRoot, roots, options = {}) => {
    grants.sync(workspaceRoot, roots, options)
    return grants.settled()
  }

  /**
   * The file-effect mode one session runs under, or `undefined` without a policy
   * service. Only `workspace-write` can use the extra-root shell capability: in
   * `read-only` the token carries no write SID, and in `danger-full-access` the
   * shell is unrestricted, so a grant there would be inert — and a big directory
   * would pay a full tree walk for nothing.
   */
  const modeOf = (session) => {
    try {
      return serviceOf(ctx, 'sandboxPolicy')?.resolve?.({ session })?.mode
    } catch {
      return undefined
    }
  }

  /** Same, addressed by a session. */
  const applyForSession = (session) => {
    const cwd = session?.header?.cwd
    if (typeof cwd !== 'string' || cwd.length === 0) return Promise.resolve()
    return apply(cwd, rootsOf(cwd), { grant: modeOf(session) === 'workspace-write' })
  }

  /** The plugin-wide settings the EZUSE page edits. */
  const readConfig = () => config.get()
  const writeConfig = (patch) => config.set(patch)

  return { store, config, rootsOf, grants, state, apply, applyForSession, modeOf, readConfig, writeConfig }
}

/**
 * Resolve a directory the user asked for: the explicit argument when present,
 * otherwise the host's own folder chooser.
 * @param {object} ctx - host context (optional `directoryPicker`).
 * @param {readonly string[]} args - the command's remaining tokens.
 * @param {string} primary - the session's workspace directory.
 * @param {AbortSignal} signal - the command's cancellation signal.
 * @returns {Promise<{ path: string } | { error: string } | { cancelled: true }>} the chosen directory.
 */
async function chooseDirectory(ctx, args, primary, signal) {
  if (args.length > 0) return resolveDirectory(args.join(' '), primary)
  const picker = serviceOf(ctx, 'directoryPicker')
  const capability = picker?.capability?.()
  if (capability?.kind !== 'native' || typeof capability.pick !== 'function') {
    return {
      error:
        '当前目录选择后端不是系统对话框（可能是远程浏览模式），请改用 /workspace add <绝对路径> 直接指定目录。',
    }
  }
  const picked = await capability.pick(signal)
  if (picked === null || picked === undefined) return { cancelled: true }
  return resolveDirectory(picked, primary)
}

/**
 * `/workspace …` handler.
 * @param {object} ctx - host context.
 * @param {ReturnType<typeof createService>} service - the plugin's service object.
 * @param {{ agent?: { session?: { header?: { cwd?: string } } }, rawInput?: string, signal?: AbortSignal }} invocation - the command invocation.
 * @returns {Promise<{ kind: 'success', text?: string } | { kind: 'error', text: string }>} the command result.
 */
async function handleCommand(ctx, service, invocation) {
  const cwd = invocation.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) {
    return { kind: 'error', text: '当前会话没有工作区目录（cwd），无法挂载附加目录。' }
  }
  const primary = cwd
  const grant = service.modeOf(invocation.agent?.session) === 'workspace-write'
  const tokens = String(invocation.rawInput ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
  const verb = (tokens[0] ?? 'list').toLowerCase()
  const rest = tokens.slice(1)

  if (verb === 'help' || verb === '-h' || verb === '--help') return { kind: 'success', text: USAGE }

  if (verb === 'list' || verb === 'ls') {
    const roots = service.rootsOf(primary)
    service.apply(primary, roots, { grant })
    return { kind: 'success', text: await renderList(primary, roots, service.state()) }
  }

  if (verb === 'add') {
    const chosen = await chooseDirectory(ctx, rest, primary, invocation.signal ?? new AbortController().signal)
    if ('cancelled' in chosen) return { kind: 'success', text: '已取消。' }
    if ('error' in chosen) return { kind: 'error', text: chosen.error }
    if (samePath(chosen.path, primary)) {
      return { kind: 'success', text: `该目录就是当前主工作区，无需重复挂载：${chosen.path}` }
    }
    const { added, roots } = service.store.add(primary, chosen.path)
    service.apply(primary, roots, { grant })
    const head = added ? `已加入附加目录：${chosen.path}` : `该目录已在附加目录中：${chosen.path}`
    return { kind: 'success', text: `${head}\n\n${await renderList(primary, roots, service.state())}` }
  }

  if (verb === 'remove' || verb === 'rm' || verb === 'delete') {
    if (rest.length === 0) return { kind: 'error', text: `缺少要移除的目录。\n${USAGE}` }
    const current = service.rootsOf(primary)
    if (current.length === 0) return { kind: 'success', text: '附加目录为空。' }
    const selector = rest.join(' ')
    const index = Number.parseInt(selector, 10)
    let target
    if (Number.isInteger(index) && String(index) === selector.trim() && index >= 1 && index <= current.length) {
      target = current[index - 1]
    } else {
      // Removal must work for a directory the user has since moved away, so the
      // selector is normalized without requiring that it still exists.
      target = canonicalPath(resolvePath(primary, selector))
    }
    const { removed, roots } = service.store.remove(primary, target)
    service.apply(primary, roots, { grant })
    const head = removed ? `已移除：${target}` : `附加目录中没有该项：${target}`
    return { kind: 'success', text: `${head}\n\n${await renderList(primary, roots, service.state())}` }
  }

  if (verb === 'clear') {
    const { roots } = service.store.clear(primary)
    service.apply(primary, [], { grant })
    const head = roots.length === 0 ? '附加目录已为空。' : `已清空 ${roots.length} 个附加目录。`
    return { kind: 'success', text: `${head}\n\n${await renderList(primary, [], service.state())}` }
  }

  return { kind: 'error', text: `未知子命令：${verb}\n${USAGE}` }
}

export const name = 'dsh-ezuse'
export const inject = ['commands']

/**
 * Plugin entry.
 * @param {object} ctx - the plugin's Cordis context.
 */
export function apply(ctx) {
  const service = createService(ctx)

  // Filesystem write fence: extra roots pass `workspace-write` for the two
  // mutation entry points, reusing the shipped sandbox for everything else.
  // Injected rather than read once at activation: the fence must decorate the
  // *live* provider whenever the composition mounts it, including after a
  // reload, and it must be uninstalled again when that provider goes away.
  ctx.inject(['fs'], (scope) => {
    scope.effect(() => installFsFence(scope, scope.fs, service.rootsOf))
  })

  // Shell write grants (Windows ACL) — revoked when the plugin unloads.
  ctx.effect(() => () => service.grants.disposeAll())

  // A session starting in a workspace restores that workspace's shell grants.
  // Deferred: the grant walks the whole directory tree, and session creation
  // must not wait for it. `tools/pre-execute` below is the hard guarantee.
  ctx.effect(() => {
    const off = ctx.on('agent/created', (payload) => {
      const session = payload?.agent?.session
      if (session === undefined) return
      setTimeout(() => {
        try {
          service.applyForSession(session)
        } catch (error) {
          ctx.logger?.warn?.(`dsh-ezuse: restoring shell grants failed: ${String(error)}`)
        }
      }, 0)
    })
    return typeof off === 'function' ? off : () => {}
  })

  // Before any tool dispatch, make sure the calling session's extra roots are
  // writable to a confined child. Awaiting the settled grant is the ordering
  // guarantee: a confined shell call must not start before its ACE exists. The
  // wait costs this call only — the ACE work itself runs off the event loop.
  ctx.effect(() => {
    const off = ctx.on('tools/pre-execute', async (exec, next) => {
      try {
        await service.applyForSession(exec?.agent?.session)
      } catch (error) {
        ctx.logger?.warn?.(`dsh-ezuse: shell grant pre-flight failed: ${String(error)}`)
      }
      return next()
    })
    return typeof off === 'function' ? off : () => {}
  })

  // Model-facing fact: one runtime-context line, only while roots exist.
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({
      name: CONTEXT_NAME,
      order: CONTEXT_ORDER,
      text: (assemble) => {
        const cwd = assemble?.agent?.session?.header?.cwd
        if (typeof cwd !== 'string' || cwd.length === 0) return ''
        try {
          return renderPromptContext(cwd, service.rootsOf(cwd))
        } catch {
          return ''
        }
      },
    })
  })

  // Human-facing surface: one slash command that manages the set.
  ctx.effect(() =>
    ctx.commands.register({
      name: COMMAND_NAME,
      description: '多工作区：为一个会话挂载多个目录（/workspace add 打开文件夹选择框）',
      handler: (invocation) => handleCommand(ctx, service, invocation),
    }),
  )

  // The 项目目录 tab's own two routes (see ./lib/http.js).
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() =>
      installRoutes(scope, {
        describe: (sessionId) => describeWorkspace(scope, service, sessionId),
        mutate: (sessionId, action, path) => mutateWorkspace(scope, service, sessionId, action, path),
        describeSession: (sessionId) => describeSession(scope, sessionId),
        workspaces: () => describeWorkspaces(scope, service),
        mutateByWorkspace: (workspacePath, action, path) => mutateByWorkspace(scope, service, workspacePath, action, path),
        readConfig: () => service.readConfig(),
        writeConfig: (patch) => service.writeConfig(patch),
      }),
    )
  })
}

export { handleCommand, renderPromptContext, describeWorkspace, mutateWorkspace, describeWorkspaces, describeSession, mutateByWorkspace, pathKey }

