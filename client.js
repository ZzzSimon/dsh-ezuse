window.__ModuleLoader__.load({
  id: 'dsh-ezuse',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-ezuse.roots'
    const ROUTE = '/ezuse/roots'

    const en = {
      tab: 'Project directories',
      title: 'Project directories',
      intro: 'This session writes into every directory listed here: the file tools and the confined shell both honour them. A shell grant costs one pass per object inside the directory (files and subdirectories alike), so mounting the folders you actually edit — not a whole repository full of node_modules — can be tens of times cheaper.',
      primary: 'Workspace',
      add: 'Add directory',
      refresh: 'Refresh',
      clear: 'Remove all',
      remove: 'Remove',
      empty: 'No extra directories yet. "Add directory" opens the system folder chooser.',
      missing: 'missing',
      filesOn: 'File writes: enabled for the extra directories',
      filesOff: 'File writes: not active (filesystem service not found)',
      shellOn: 'Shell writes: enabled ({count} granted)',
      shellOff: 'Shell writes: not active ({reason})',
      shellPending: 'Shell writes: granting… (the first mount of a big directory walks its whole tree; nothing else waits on it)',
      shellUnrestricted: 'Shell writes: unrestricted in this session (danger-full-access) — the grant only matters under workspace-write',
      shellReadOnly: 'Shell writes: this session is read-only, so the grant grants nothing',
      settingsNav: 'EZUSE',
      settingsTitle: 'EZUSE',
      settingsIntro: 'Settings for the dsh-ezuse plugin: completion reminders, and the multi-root workspace feature.',
      notifyEnabled: 'Notify me when a turn finishes',
      notifyEnabledHint: 'A browser notification appears after the agent finishes a turn.',
      notifyHidden: 'Only when the DSH page is not visible',
      notifyHiddenHint: 'Another browser tab, a minimised window or another app all count as not visible — it still notifies. Only an on-screen conversation is skipped.',
      notifyPermission: 'Browser notification permission',
      notifyPermissionState: 'Current: {state}',
      notifySound: 'Completion sound',
      notifySoundHint: 'Plays with the notification; both motifs are synthesised, not recordings.',
      soundChime: 'Chime (two notes)',
      soundMcDonalds: 'McDonald’s “ba-da-ba-ba-ba”',
      soundOff: 'Silent',
      notifySoundPreview: 'Preview',
      notifyRequest: 'Allow',
      notifyTest: 'Test notification',
      notifyTestHint: 'Checks that the browser really shows it.',
      notifySend: 'Send',
      notifyQuestion: 'Notify me when the model asks a question',
      notifyQuestionHint: 'The agent is waiting for your answer; you get a notification even if you are in another tab.',
      notifyQuestionBody: '{workspace} · waiting for your answer: {question}',
      notifyQuestionBodyFallback: 'The agent is waiting for your answer.',
      notifyQuestionTitleFallback: 'Waiting for your answer',
      notifyTitleFallback: 'Turn finished',
      notifyBodyFallback: 'This turn has finished — come back when you are ready.',
      notifyBodyWorkspace: '{workspace} · this turn has finished',
      notifyLast: 'Last notification',
      notifyLastHint: 'Why the previous completion did or did not pop.',
      notifyLastNone: 'nothing yet',
      notifyLastSent: '{when} · {kind}, {count} session(s), sound: {sound}',
      kindCompletion: 'turn finished',
      kindQuestion: 'asked a question',
      notifySkipDisabled: '{when} · skipped: notifications are off',
      notifySkipPermission: '{when} · skipped: browser permission is not granted',
      notifySkipVisible: '{when} · skipped: this window was in the foreground',
      notifySkipQuestionOff: '{when} · skipped: question notifications are off',
      toastAdded: 'Mounted {path}',
      panelNav: 'Project directories',
      panelTitle: 'Project directories',
      panelIntro: 'Every workspace and the extra directories mounted into it. Mounting here is workspace-level: every session started in that directory sees it.',
      panelWorkspace: 'Workspace',
      panelMount: 'Mount directory…',
      panelEmpty: 'No extra directories mounted.',
      panelNoWorkspaces: 'No workspaces yet.',
      toastFailed: 'Could not mount: {reason}',
      settingsFooter: 'Multi-root workspace: mount directories in the 项目目录 tab of a conversation. Shell grants apply only to workspace-write sessions.',
      absolutePaths: 'Relative paths still resolve to the workspace — address these directories with absolute paths.',
      loading: 'Loading…',
      failed: 'Could not read the directory state: {reason}',
      pickFailed: 'Could not open the folder chooser: {reason}',
      cancelled: 'Cancelled.',
      routeMissing: 'The Host half of this plugin is not active yet (no /ezuse/roots route). Restart DSH, then refresh this page.',
      noticeMissing: 'Host half not active — restart DSH and refresh.',
    }
    const zh = {
      tab: '项目目录',
      title: '项目目录',
      intro: '这个会话同时写入下面列出的每个目录：文件工具与受限 shell 都对它们生效。shell 授权按目录里的对象数（文件+子目录）一次性计费，所以只挂你真正要改的子目录、而不是整个带 node_modules 的仓库，能快几十倍。',
      primary: '主工作区',
      add: '添加目录',
      refresh: '刷新',
      clear: '全部移除',
      remove: '移除',
      empty: '还没有附加目录。点「添加目录」会打开系统文件夹选择框。',
      missing: '目录不存在',
      filesOn: '文件写入：已对附加目录生效',
      filesOff: '文件写入：未生效（未找到文件服务）',
      shellOn: 'shell 写入：已生效（{count} 个目录已授权）',
      shellOff: 'shell 写入：未生效（{reason}）',
      shellPending: 'shell 写入：正在授权…（首次挂载大目录要遍历整棵树，其它操作不受影响）',
      shellUnrestricted: 'shell 写入：当前会话不受限（danger-full-access），这条授权只在 workspace-write 下才有意义',
      shellReadOnly: 'shell 写入：当前会话是 read-only，授权不生效',
      settingsNav: 'EZUSE',
      settingsTitle: 'EZUSE',
      settingsIntro: 'dsh-ezuse 插件的设置：完成提醒，以及多工作区功能。',
      notifyEnabled: '对话完成时提醒我',
      notifyEnabledHint: '一轮结束后发一条浏览器通知。',
      notifyHidden: '仅当 DSH 页面不可见时提醒',
      notifyHiddenHint: '切到别的标签页、最小化窗口、切到别的应用都算「不可见」，照常提醒；只有你正看着这个对话时才不打扰。',
      notifyPermission: '浏览器通知权限',
      notifyPermissionState: '当前：{state}',
      notifySound: '提示音',
      notifySoundHint: '随通知一起播放；两种音效都是合成的，不是录音。',
      soundChime: '清脆两声',
      soundMcDonalds: '麦当劳 ba-da-ba-ba-ba',
      soundOff: '静音',
      notifySoundPreview: '试听',
      notifyRequest: '申请权限',
      notifyTest: '测试通知',
      notifyTestHint: '确认浏览器真的会弹出来。',
      notifySend: '发送',
      notifyQuestion: '模型提问时提醒我',
      notifyQuestionHint: '模型在等你回答时会发通知；即使你在别的标签页也能收到。',
      notifyQuestionBody: '{workspace} · 等你回答：{question}',
      notifyQuestionBodyFallback: '模型正在等你回答。',
      notifyQuestionTitleFallback: '等你回答',
      notifyTitleFallback: '对话已完成',
      notifyBodyFallback: '这一轮已经结束，可以回来看看了。',
      notifyBodyWorkspace: '{workspace} · 这一轮已经结束',
      notifyLast: '最近一次提醒',
      notifyLastHint: '上一次完成时为什么弹 / 为什么没弹。',
      notifyLastNone: '还没有记录',
      notifyLastSent: '{when} · {kind}（{count} 个会话），音效：{sound}',
      kindCompletion: '对话完成',
      kindQuestion: '模型提问',
      notifySkipDisabled: '{when} · 跳过：提醒开关是关的',
      notifySkipPermission: '{when} · 跳过：浏览器通知权限未授予',
      notifySkipVisible: '{when} · 跳过：这个窗口当时在前台',
      notifySkipQuestionOff: '{when} · 跳过：提问提醒开关是关的',
      toastAdded: '已挂载 {path}',
      panelNav: '项目目录',
      panelTitle: '项目目录',
      panelIntro: '每个工作区以及挂载进去的额外目录。这里的挂载是工作区级的：在该目录里开的每个会话都会看到。',
      panelWorkspace: '工作区',
      panelMount: '挂载目录…',
      panelEmpty: '还没有挂载额外目录。',
      panelNoWorkspaces: '还没有工作区。',
      toastFailed: '挂载失败：{reason}',
      settingsFooter: '多工作区：在会话的「项目目录」页签里挂载目录。shell 授权只在 workspace-write 会话里生效。',
      absolutePaths: '相对路径仍然解析到主工作区——请对附加目录使用绝对路径。',
      loading: '正在读取…',
      failed: '读取目录状态失败：{reason}',
      pickFailed: '无法打开文件夹选择框：{reason}',
      cancelled: '已取消。',
      routeMissing: '宿主还没加载这个插件的这一代模块（缺少 /ezuse/roots 路由）：请重启 DSH 后刷新页面。',
      noticeMissing: '宿主模块未激活：重启 DSH 后刷新页面。',
    }

    const CSS = `
.ezuse-roots {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 24px 40px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  box-sizing: border-box;
}
.ezuse-roots__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ezuse-roots__title { margin: 0; font-size: 15px; font-weight: 600; line-height: 24px; }
.ezuse-roots__intro { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); }
.ezuse-roots__actions { display: flex; align-items: center; gap: 8px; flex: none; }
.ezuse-roots__button {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 5px 12px;
  font: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.ezuse-roots__button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.ezuse-roots__button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ezuse-roots__button:disabled { opacity: .5; cursor: default; }
.ezuse-roots__button--primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.ezuse-roots__button--quiet { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); padding: 4px 8px; }
.ezuse-roots__button--quiet:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.ezuse-roots__card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.ezuse-roots__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  min-height: 40px;
}
.ezuse-roots__row:first-child { border-top: 0; }
.ezuse-roots__row--primary { background: var(--dsw-alias-bg-layer-2); }
.ezuse-roots__chip {
  flex: none;
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.ezuse-roots__chip--primary { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.ezuse-roots__chip--warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.ezuse-roots__path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  direction: ltr;
  text-align: left;
}
.ezuse-roots__empty { margin: 0; padding: 14px; color: var(--dsw-alias-label-secondary); }
.ezuse-roots__facts { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.ezuse-roots__error { margin: 0; color: var(--dsw-alias-state-error-primary); }
.ezuse-settings { display: flex; flex-direction: column; gap: 16px; padding: 4px 0 24px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; box-sizing: border-box; }
.ezuse-settings__title { margin: 0; font-size: 15px; font-weight: 600; line-height: 24px; }
.ezuse-settings__intro { margin: 0; color: var(--dsw-alias-label-secondary); }
.ezuse-settings__card { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.ezuse-settings__row { display: flex; align-items: center; gap: 16px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.ezuse-settings__row:first-child { border-top: 0; }
.ezuse-settings__text { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.ezuse-settings__hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.ezuse-settings__control { flex: none; display: flex; align-items: center; gap: 8px; }
.ezuse-settings__actions { display: inline-flex; align-items: center; gap: 8px; }
.ezuse-settings__select { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 5px 10px; font: inherit; cursor: pointer; }
.ezuse-settings__select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ezuse-settings__button { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 5px 12px; font: inherit; cursor: pointer; }
.ezuse-settings__button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.ezuse-settings__button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ezuse-settings__button:disabled { opacity: .5; cursor: default; }
.ezuse-settings__error { margin: 0; color: var(--dsw-alias-state-error-primary); }
.ezuse-settings__footer { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.ezuse-switch { position: relative; width: 34px; height: 20px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background 120ms ease, border-color 120ms ease; }
.ezuse-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.ezuse-switch--on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.ezuse-switch__thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform 120ms ease; }
.ezuse-switch--on .ezuse-switch__thumb { transform: translateX(14px); }
.ezuse-toast { position: fixed; right: 20px; bottom: 20px; z-index: 60; max-width: 420px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); word-break: break-all; }
.ezuse-toast--error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.ezuse-roots__ok { color: var(--dsw-alias-state-success-primary); }
`

    /** Substitute `{name}` placeholders in one locale string. */
    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) =>
        values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
      )
    }

    /** Read the mounted directory state for one session. */
    async function readState(sessionId) {
      const response = await fetch(`${ROUTE}?session=${encodeURIComponent(String(sessionId))}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (response.ok === false) {
        return { ok: false, error: response.status === 404 ? 'route-missing' : `HTTP ${response.status}` }
      }
      try {
        return await response.json()
      } catch (error) {
        return { ok: false, error: 'route-missing' }
      }
    }

    /** Apply one mutation and receive the refreshed state. */
    async function writeState(sessionId, action, path) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-dsh-ezuse': '1' },
        body: JSON.stringify({ session: String(sessionId), action, path }),
      })
      if (response.ok === false) {
        return { ok: false, error: response.status === 404 ? 'route-missing' : `HTTP ${response.status}` }
      }
      try {
        return await response.json()
      } catch (error) {
        return { ok: false, error: 'route-missing' }
      }
    }

    /** One notice line for a failed call, with the restart hint when the route is absent. */
    function failureText(t, error) {
      return error === 'route-missing' ? t('noticeMissing') : format(t('failed'), { reason: String(error) })
    }

    function RootsView(props) {
      const { sessionId, pickDirectory, t } = props
      const [state, setState] = React.useState({ status: 'loading' })
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          const payload = await readState(sessionId)
          setState(payload && payload.ok ? { status: 'ready', data: payload } : {
            status: 'error',
            error: (payload && payload.error) || 'unknown',
          })
        } catch (error) {
          setState({ status: 'error', error: String((error && error.message) || error) })
        }
      }, [sessionId])

      React.useEffect(() => {
        let live = true
        void (async () => {
          try {
            const payload = await readState(sessionId)
            if (!live) return
            setState(payload && payload.ok ? { status: 'ready', data: payload } : {
              status: 'error',
              error: (payload && payload.error) || 'unknown',
            })
          } catch (error) {
            if (live) setState({ status: 'error', error: String((error && error.message) || error) })
          }
        })()
        return () => { live = false }
      }, [sessionId])

      const mutate = React.useCallback(
        async (action, path) => {
          setBusy(true)
          setNotice(null)
          try {
            const payload = await writeState(sessionId, action, path)
            if (payload && payload.ok) setState({ status: 'ready', data: payload })
            else setNotice(payload && payload.error === 'route-missing' ? t('noticeMissing') : ((payload && payload.error) || 'failed'))
          } catch (error) {
            setNotice(String((error && error.message) || error))
          } finally {
            setBusy(false)
          }
        },
        [sessionId],
      )

      const addDirectory = React.useCallback(async () => {
        if (typeof pickDirectory !== 'function') return
        setBusy(true)
        setNotice(null)
        try {
          const picked = await pickDirectory()
          if (picked === null || picked === undefined) {
            setNotice(t('cancelled'))
            return
          }
          const payload = await writeState(sessionId, 'add', picked)
          if (payload && payload.ok) setState({ status: 'ready', data: payload })
          else setNotice(payload && payload.error === 'route-missing' ? t('noticeMissing') : ((payload && payload.error) || 'failed'))
        } catch (error) {
          setNotice(format(t('pickFailed'), { reason: String((error && error.message) || error) }))
        } finally {
          setBusy(false)
        }
      }, [pickDirectory, sessionId, t])

      // A running shell grant is reported, not awaited by the UI: keep the view
      // fresh while it settles so the state resolves without a manual refresh.
      const granting = state.status === 'ready' && state.data.shell !== null && state.data.shell !== undefined
        && state.data.shell.pending === true
      React.useEffect(() => {
        if (!granting) return undefined
        const timer = setTimeout(() => {
          void load()
        }, 1500)
        return () => clearTimeout(timer)
      }, [granting, load, state])

      const head = h(
        'div',
        { className: 'ezuse-roots__head' },
        h(
          'div',
          null,
          h('h2', { className: 'ezuse-roots__title' }, t('title')),
          h('p', { className: 'ezuse-roots__intro' }, t('intro')),
        ),
        h(
          'div',
          { className: 'ezuse-roots__actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'ezuse-roots__button ezuse-roots__button--primary',
              onClick: addDirectory,
              disabled: busy || typeof pickDirectory !== 'function',
            },
            t('add'),
          ),
          h(
            'button',
            { type: 'button', className: 'ezuse-roots__button', onClick: () => void load(), disabled: busy },
            t('refresh'),
          ),
        ),
      )

      if (state.status === 'loading') {
        return h('section', { className: 'ezuse-roots' }, head, h('p', { className: 'ezuse-roots__facts' }, t('loading')), h('style', null, CSS))
      }
      if (state.status === 'error') {
        return h(
          'section',
          { className: 'ezuse-roots' },
          head,
          h('p', { className: 'ezuse-roots__error' }, failureText(t, state.error)),
          h('style', null, CSS),
        )
      }

      const data = state.data
      const roots = Array.isArray(data.roots) ? data.roots : []
      const shell = data.shell || {}
      const rows = roots.map((row, index) =>
        h(
          'div',
          { className: 'ezuse-roots__row', key: row.path },
          h('span', { className: 'ezuse-roots__chip' }, String(index + 1)),
          h('code', { className: 'ezuse-roots__path', title: row.path }, row.path),
          row.exists === false ? h('span', { className: 'ezuse-roots__chip ezuse-roots__chip--warn' }, t('missing')) : null,
          h(
            'button',
            {
              type: 'button',
              className: 'ezuse-roots__button ezuse-roots__button--quiet',
              onClick: () => void mutate('remove', row.path),
              disabled: busy,
            },
            t('remove'),
          ),
        ),
      )

      const card = h(
        'div',
        { className: 'ezuse-roots__card' },
        h(
          'div',
          { className: 'ezuse-roots__row ezuse-roots__row--primary' },
          h('span', { className: 'ezuse-roots__chip ezuse-roots__chip--primary' }, t('primary')),
          h('code', { className: 'ezuse-roots__path', title: data.primary || '' }, data.primary || ''),
        ),
        rows.length > 0 ? rows : h('p', { className: 'ezuse-roots__empty' }, t('empty')),
      )

      const facts = h(
        'div',
        { className: 'ezuse-roots__facts' },
        h('span', { className: data.fence ? 'ezuse-roots__ok' : undefined }, data.fence ? t('filesOn') : t('filesOff')),
        h(
          'span',
          { className: shell.supported ? 'ezuse-roots__ok' : undefined },
          data.mode === 'danger-full-access'
            ? t('shellUnrestricted')
            : data.mode === 'read-only'
              ? t('shellReadOnly')
              : shell.supported
                ? shell.pending === true
                  ? t('shellPending')
                  : format(t('shellOn'), { count: shell.granted })
                : format(t('shellOff'), { reason: shell.reason || 'unknown' }),
        ),
        h('span', null, t('absolutePaths')),
        roots.length > 0
          ? h(
              'button',
              {
                type: 'button',
                className: 'ezuse-roots__button ezuse-roots__button--quiet',
                onClick: () => void mutate('clear'),
                disabled: busy,
              },
              t('clear'),
            )
          : null,
      )

      return h(
        'section',
        { className: 'ezuse-roots' },
        head,
        card,
        notice === null ? null : h('p', { className: 'ezuse-roots__error' }, notice),
        facts,
        h('style', null, CSS),
      )
    }

    // ---- shared settings (host `/ezuse/config`) ---------------------------
    const CONFIG_ROUTE = '/ezuse/config'
    const SESSION_ROUTE = '/ezuse/session'
    const configState = { value: null, listeners: new Set() }

    /** Publish one settings value to every mounted consumer. */
    function publishConfig(value) {
      configState.value = value
      for (const listener of configState.listeners) {
        try {
          listener(value)
        } catch {
          /* one broken consumer must not stop the rest */
        }
      }
    }

    /** Title and workspace of one session, for naming a notification after it. */
    async function readSessionInfo(sessionId) {
      const response = await fetch(`${SESSION_ROUTE}?session=${encodeURIComponent(String(sessionId))}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (response.ok === false) return null
      try {
        const payload = await response.json()
        return payload !== null && payload.ok === true ? payload : null
      } catch {
        return null
      }
    }

    /** Cut one line to a readable length for a notification body. */
    function shorten(text, limit) {
      const value = String(text ?? '').replace(/\s+/g, ' ').trim()
      if (value.length <= limit) return value
      return `${value.slice(0, Math.max(0, limit - 1))}…`
    }

    /**
     * Fire a notification for one session, named after that session.
     * @param {string} sessionId - the session the notification is about.
     * @param {(sessionId: string) => void} [openSession] - bring that session back when the user clicks.
     * @param {'completion'|'question'} [kind] - what happened.
     * @param {string} [detail] - the question text for `question`.
     */
    async function notifySession(sessionId, openSession, kind = 'completion', detail) {
      let info = null
      try {
        info = await readSessionInfo(sessionId)
      } catch {
        info = null
      }
      const fallback = translation(kind === 'question' ? 'notifyQuestionTitleFallback' : 'notifyTitleFallback')
      const title = info !== null && typeof info.title === 'string' && info.title.length > 0 ? info.title : fallback
      const workspace = info !== null && typeof info.workspace === 'string' ? info.workspace : ''
      let body
      if (kind === 'question') {
        const asked = typeof detail === 'string' && detail.length > 0 ? shorten(detail, 140) : translation('notifyQuestionBodyFallback')
        body = workspace.length > 0 ? format(translation('notifyQuestionBody'), { workspace, question: asked }) : asked
      } else {
        body =
          workspace.length > 0
            ? format(translation('notifyBodyWorkspace'), { workspace, title })
            : translation('notifyBodyFallback')
      }
      const settings = configState.value === null || configState.value === undefined ? undefined : configState.value.notifications
      playSound(settings === undefined ? 'chime' : settings.sound)
      try {
        // A unique tag per event: reusing one tag makes the platform replace a
        // notification still sitting in the tray instead of popping a new one.
        const notification = new Notification(title, { body, tag: `ezuse-${String(sessionId)}-${Date.now()}` })
        if (typeof notification.addEventListener === 'function') {
          notification.addEventListener('click', () => {
            // Three independent best efforts: a missing window.focus must not
            // swallow the navigation, and a refused focus must not either.
            try {
              if (typeof window !== 'undefined' && typeof window.focus === 'function') window.focus()
            } catch {
              /* focusing is optional */
            }
            try {
              if (typeof openSession === 'function') openSession(sessionId)
            } catch {
              /* navigation is optional */
            }
            try {
              if (typeof notification.close === 'function') notification.close()
            } catch {
              /* closing is optional */
            }
          })
        }
      } catch {
        /* a blocked notification must never break the conversation */
      }
    }

    /** Read the plugin's settings from the host. */
    async function loadConfig() {
      const response = await fetch(CONFIG_ROUTE, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      if (response.ok === false) return null
      try {
        const payload = await response.json()
        if (payload && payload.ok === true) {
          publishConfig(payload.config)
          return payload.config
        }
      } catch {
        /* a non-JSON answer means the host half is not mounted */
      }
      return null
    }

    /** Merge a patch into the plugin's settings. */
    async function saveConfig(patch) {
      const response = await fetch(CONFIG_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-dsh-ezuse': '1' },
        body: JSON.stringify(patch),
      })
      if (response.ok === false) throw new Error(response.status === 404 ? 'route-missing' : `HTTP ${response.status}`)
      const payload = await response.json()
      if (payload === null || payload.ok !== true) throw new Error((payload && payload.error) || 'failed')
      publishConfig(payload.config)
      return payload.config
    }

    /** Subscribe a component to the settings, loading them on first use. */
    function useConfig() {
      const [config, setConfig] = React.useState(configState.value)
      React.useEffect(() => {
        let live = true
        const listener = (value) => {
          if (live) setConfig(value)
        }
        configState.listeners.add(listener)
        if (configState.value === null) void loadConfig()
        return () => {
          live = false
          configState.listeners.delete(listener)
        }
      }, [])
      return config
    }

    /** The last notification decision, so the settings page can explain silence. */
    const notifyLog = { value: null, listeners: new Set() }

    /** Record one decision and let the settings page re-render. */
    function publishNotifyLog(entry) {
      notifyLog.value = entry
      for (const listener of notifyLog.listeners) {
        try {
          listener(entry)
        } catch {
          /* one broken consumer must not stop the rest */
        }
      }
    }

    /** Subscribe to the last notification decision. */
    function useNotifyLog() {
      const [entry, setEntry] = React.useState(notifyLog.value)
      React.useEffect(() => {
        let live = true
        const listener = (value) => {
          if (live) setEntry(value)
        }
        notifyLog.listeners.add(listener)
        return () => {
          live = false
          notifyLog.listeners.delete(listener)
        }
      }, [])
      return entry
    }

    /**
     * Renderless watcher for the whole app: fires a browser notification when a
     * session's turn ends.
     *
     * It watches the *complete* status snapshot rather than one session, because
     * the session that finishes is usually not the one on screen. `completionUnread`
     * is the harness' own "finished while you were not looking" fact and is the
     * primary edge; `running: true → false` covers a foreground finish when the
     * user turned "only when hidden" off. Every decision is recorded so a silent
     * notification can be explained instead of guessed at.
     */
    function NotifyWatcher(props) {
      const { openSession } = props
      const config = useConfig()
      const statuses =
        typeof props.useSessionStatus === 'function' ? props.useSessionStatus((snapshot) => snapshot) : undefined
      const previous = React.useRef(null)

      React.useEffect(() => {
        if (statuses === null || statuses === undefined || typeof statuses.forEach !== 'function') return
        const next = new Map()
        statuses.forEach((status, id) => {
          if (status === null || status === undefined) return
          const interaction = status.pendingInteraction
          next.set(id, {
            running: status.running,
            unread: status.completionUnread === true,
            // The request identity, so a *new* question is an edge even when the
            // previous one was answered and another replaced it immediately.
            pending: interaction === undefined || interaction === null ? null : interaction.key,
            pendingKind: interaction === undefined || interaction === null ? null : interaction.kind,
            asked: askedText(interaction),
          })
        })
        const before = previous.current
        previous.current = next
        // The first snapshot is a baseline: only later edges may notify.
        if (before === null) return

        const settings = config !== null && config !== undefined ? config.notifications : undefined
        const hidden = typeof document === 'undefined' || document.visibilityState !== 'visible'
        const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

        const finished = []
        const asked = []
        next.forEach((now, id) => {
          const was = before.get(id)
          if (was === undefined) return
          if (now.unread && !was.unread) finished.push(id)
          else if (was.running === true && now.running === false) finished.push(id)
          // A question is a *new* pending request, not the same one re-rendered.
          if (now.pending !== null && now.pending !== was.pending && isQuestion(now.pendingKind)) {
            asked.push({ id, text: now.asked })
          }
        })

        /** The shared admission decision, so both kinds report the same way. */
        const admit = (kind, sessions) => {
          let reason = null
          if (settings === undefined || settings === null || settings.enabled !== true) reason = 'disabled'
          else if (kind === 'question' && settings.onQuestion === false) reason = 'question-off'
          else if (permission !== 'granted') reason = 'permission'
          else if (settings.onlyWhenHidden === true && !hidden) reason = 'visible'
          publishNotifyLog({
            at: Date.now(),
            kind,
            outcome: reason === null ? 'sent' : 'skipped',
            reason,
            sessions,
            sound: reason === null ? settings.sound ?? 'chime' : undefined,
          })
          return reason === null
        }

        if (asked.length > 0 && admit('question', asked.map((entry) => entry.id))) {
          for (const entry of asked.slice(0, 3)) void notifySession(entry.id, openSession, 'question', entry.text)
        }
        if (finished.length > 0 && admit('completion', finished)) {
          for (const id of finished.slice(0, 3)) void notifySession(id, openSession, 'completion')
        }
      })

      return null
    }

    /** Whether one pending interaction is the model asking the user something. */
    function isQuestion(kind) {
      return kind === 'question' || kind === 'plan-review'
    }

    /**
     * The first question of a pending request, for the notification body.
     * @param {object | null | undefined} interaction - `SessionStatus.pendingInteraction`.
     * @returns {string | undefined} its first question text, when it carries one.
     */
    function askedText(interaction) {
      if (interaction === null || interaction === undefined) return undefined
      const questions = interaction.questions
      if (!Array.isArray(questions) || questions.length === 0) return undefined
      const first = questions[0]
      const text = first !== null && typeof first === 'object' ? first.question ?? first.header : first
      return typeof text === 'string' && text.length > 0 ? text : undefined
    }

    /** Human sentence for the last notification decision. */
    function describeLastAttempt(t, entry) {
      if (entry === null || entry === undefined) return t('notifyLastNone')
      const when = new Date(entry.at).toLocaleTimeString()
      if (entry.outcome === 'sent') {
        return format(t('notifyLastSent'), {
          when,
          kind: entry.kind === 'question' ? t('kindQuestion') : t('kindCompletion'),
          count: (entry.sessions ?? []).length,
          sound: entry.sound === 'off' || entry.sound === undefined ? t('soundOff') : entry.sound,
        })
      }
      if (entry.reason === 'disabled') return format(t('notifySkipDisabled'), { when })
      if (entry.reason === 'permission') return format(t('notifySkipPermission'), { when })
      if (entry.reason === 'visible') return format(t('notifySkipVisible'), { when })
      if (entry.reason === 'question-off') return format(t('notifySkipQuestionOff'), { when })
      return t('notifyLastNone')
    }

    /** The EZUSE settings page: the plugin's single configuration place. */
    function EzuseSettings(props) {
      const { t } = props
      const config = useConfig()
      const [permission, setPermission] = React.useState(() =>
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
      )
      const [notice, setNotice] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const lastAttempt = useNotifyLog()

      const settings = (config && config.notifications) || { enabled: true, onlyWhenHidden: true }

      const update = async (patch) => {
        setBusy(true)
        setNotice(null)
        try {
          await saveConfig(patch)
        } catch (error) {
          setNotice(error && error.message === 'route-missing' ? t('noticeMissing') : String((error && error.message) || error))
        } finally {
          setBusy(false)
        }
      }

      const askPermission = async () => {
        if (typeof Notification === 'undefined') return
        try {
          setPermission(await Notification.requestPermission())
        } catch (error) {
          setNotice(String((error && error.message) || error))
        }
      }

      const sendTest = () => {
        // The test must exercise the whole path a real completion takes: the
        // notification *and* the configured motif, otherwise "test works but the
        // real thing is silent" stays undiagnosable.
        playSound(settings.sound ?? 'chime')
        if (typeof Notification === 'undefined') return
        try {
          new Notification('DSH · 提醒测试', { body: '能看到这条、听到提示音，就说明提醒可用。' })
        } catch (error) {
          setNotice(String((error && error.message) || error))
        }
      }

      const row = (id, label, hint, control) =>
        h(
          'div',
          { className: 'ezuse-settings__row', key: id },
          h(
            'div',
            { className: 'ezuse-settings__text' },
            h('span', { className: 'ezuse-settings__label' }, label),
            hint === null || hint === undefined ? null : h('span', { className: 'ezuse-settings__hint' }, hint),
          ),
          h('div', { className: 'ezuse-settings__control' }, control),
        )

      const toggle = (id, checked, onChange) =>
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': checked === true ? 'true' : 'false',
            'aria-label': id,
            className: checked === true ? 'ezuse-switch ezuse-switch--on' : 'ezuse-switch',
            onClick: onChange,
            disabled: busy,
          },
          h('span', { className: 'ezuse-switch__thumb' }),
        )

      return h(
        'section',
        { className: 'ezuse-settings' },
        h('h2', { className: 'ezuse-settings__title' }, t('settingsTitle')),
        h('p', { className: 'ezuse-settings__intro' }, t('settingsIntro')),
        h(
          'div',
          { className: 'ezuse-settings__card' },
          row(
            'notify',
            t('notifyEnabled'),
            t('notifyEnabledHint'),
            toggle('notify-enabled', settings.enabled, () => void update({ notifications: { enabled: !settings.enabled } })),
          ),
          row(
            'hidden',
            t('notifyHidden'),
            t('notifyHiddenHint'),
            toggle('notify-hidden', settings.onlyWhenHidden, () =>
              void update({ notifications: { onlyWhenHidden: !settings.onlyWhenHidden } }),
            ),
          ),
          row(
            'question',
            t('notifyQuestion'),
            t('notifyQuestionHint'),
            toggle('notify-question', settings.onQuestion !== false, () =>
              void update({ notifications: { onQuestion: settings.onQuestion === false } }),
            ),
          ),
          row(
            'sound',
            t('notifySound'),
            t('notifySoundHint'),
            h(
              'span',
              { className: 'ezuse-settings__actions' },
              h(
                'select',
                {
                  className: 'ezuse-settings__select',
                  'aria-label': 'notify-sound',
                  value: settings.sound ?? 'chime',
                  onChange: (event) => void update({ notifications: { sound: event.target.value } }),
                },
                h('option', { value: 'chime' }, t('soundChime')),
                h('option', { value: 'mcdonalds' }, t('soundMcDonalds')),
                h('option', { value: 'off' }, t('soundOff')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ezuse-settings__button',
                  onClick: () => playSound(settings.sound ?? 'chime'),
                },
                t('notifySoundPreview'),
              ),
            ),
          ),
          row(
            'permission',
            t('notifyPermission'),
            format(t('notifyPermissionState'), { state: permission }),
            h(
              'button',
              {
                type: 'button',
                className: 'ezuse-settings__button',
                onClick: () => void askPermission(),
                disabled: permission === 'granted' || permission === 'unsupported',
              },
              t('notifyRequest'),
            ),
          ),
          row(
            'last',
            t('notifyLast'),
            t('notifyLastHint'),
            h('span', { className: 'ezuse-settings__hint' }, describeLastAttempt(t, lastAttempt)),
          ),
          row(
            'test',
            t('notifyTest'),
            t('notifyTestHint'),
            h(
              'button',
              {
                type: 'button',
                className: 'ezuse-settings__button',
                onClick: sendTest,
                disabled: permission !== 'granted',
              },
              t('notifySend'),
            ),
          ),
        ),
        notice === null ? null : h('p', { className: 'ezuse-settings__error' }, notice),
        h('p', { className: 'ezuse-settings__footer' }, t('settingsFooter')),
        h('style', null, CSS),
      )
    }

    /** One transient message, shown by the overlay toast. */
    const toastState = { value: null, listeners: new Set(), seq: 0 }

    /**
     * Publish a short confirmation or failure. The plugin's own actions run
     * outside any conversation surface (a sidebar menu row, for example), so this
     * is the one place they can report back.
     * @param {'ok'|'error'} tone - how it should read.
     * @param {string} message - the text.
     */
    function showToast(tone, message) {
      toastState.seq += 1
      toastState.value = { id: toastState.seq, tone, message }
      for (const listener of toastState.listeners) {
        try {
          listener(toastState.value)
        } catch {
          /* one broken consumer must not stop the rest */
        }
      }
    }

    /** One shared audio context; the first user gesture in the page unlocks it. */
    let audioContext = null

    /**
     * The two selectable motifs, as `[startOffset, frequency, length]` triples.
     *
     * `mcdonalds` is the five-note "ba-da-ba-ba-ba" signature in 简谱 `6̲ 7̲ 1 6 5`
     * with tonic 1 = C5: the first two notes sit an octave down (低音 6、7), then
     * the tonic, then 6 back up in its own octave, and 5 held long to close the
     * phrase. `chime` is the neutral fallback.
     */
    const SOUND_MOTIFS = {
      chime: [
        [0, 880, 0.3],
        [0.15, 1174.66, 0.3],
      ],
      mcdonalds: [
        [0, 440.0, 0.15], // 6̲  A4  (low)
        [0.15, 493.88, 0.15], // 7̲  B4  (low)
        [0.3, 523.25, 0.15], // 1   C5  (tonic)
        [0.45, 880.0, 0.15], // 6   A5  (own octave, the leap)
        [0.6, 783.99, 0.55], // 5   G5  (held to close the phrase)
      ],
    }

    /**
     * Play one notification motif through WebAudio. Browsers only let audio start
     * after the page has been interacted with, so a suspended context is resumed
     * and the notes are scheduled *after* that resolves — scheduling into a
     * suspended context silently plays nothing. Best-effort: never throws.
     * @param {'chime'|'mcdonalds'|'off'|undefined} kind - which motif to play.
     * @returns {boolean} whether a motif was handed to the audio clock.
     */
    function playSound(kind) {
      if (kind === 'off' || kind === undefined || kind === null) return false
      const motif = SOUND_MOTIFS[kind] ?? SOUND_MOTIFS.chime
      try {
        const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext ?? window.webkitAudioContext
        if (typeof Ctor !== 'function') return false
        audioContext ??= new Ctor()

        const schedule = () => {
          const now = typeof audioContext.currentTime === 'number' ? audioContext.currentTime : 0
          for (const [offset, frequency, length] of motif) {
            const oscillator = audioContext.createOscillator()
            const gain = audioContext.createGain()
            // A triangle wave reads closer to a sung "ba" than a pure sine.
            oscillator.type = kind === 'mcdonalds' ? 'triangle' : 'sine'
            oscillator.frequency.value = frequency
            // Attack, short decay to a sustain level, then a release that starts
            // just before the end: a note held for a second must sound *held* and
            // then released, not like one long fade-out.
            const attack = 0.02
            const decay = Math.min(0.08, length * 0.3)
            const release = Math.min(0.18, length * 0.4)
            const sustain = length > 0.3 ? 0.12 : 0.18
            gain.gain.setValueAtTime(0.0001, now + offset)
            gain.gain.exponentialRampToValueAtTime(0.18, now + offset + attack)
            gain.gain.exponentialRampToValueAtTime(sustain, now + offset + attack + decay)
            gain.gain.setValueAtTime(sustain, now + offset + length - release)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length)
            oscillator.connect(gain)
            gain.connect(audioContext.destination)
            oscillator.start(now + offset)
            oscillator.stop(now + offset + length + 0.02)
          }
        }

        if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
          void Promise.resolve(audioContext.resume())
            .then(() => {
              try {
                schedule()
              } catch {
                /* audio is a nicety, never a failure */
              }
            })
            .catch(() => {})
        } else {
          schedule()
        }
        return true
      } catch {
        /* audio is a nicety, never a failure */
        return false
      }
    }

    /** Subscribe to the transient message. */
    function useToast() {
      const [toast, setToast] = React.useState(toastState.value)
      React.useEffect(() => {
        let live = true
        const listener = (value) => {
          if (live) setToast(value)
        }
        toastState.listeners.add(listener)
        return () => {
          live = false
          toastState.listeners.delete(listener)
        }
      }, [])
      return toast
    }

    /** The transient message itself: bottom-right, auto-dismissing. */
    function EzuseToast() {
      const toast = useToast()
      React.useEffect(() => {
        if (toast === null || toast === undefined) return undefined
        const timer = setTimeout(() => {
          if (toastState.value !== null && toastState.value.id === toast.id) {
            toastState.value = null
            for (const listener of toastState.listeners) {
              try {
                listener(null)
              } catch {
                /* one broken consumer must not stop the rest */
              }
            }
          }
        }, 4200)
        // A browser has no unref; a test harness does, and it should not wait 4s.
        if (typeof timer.unref === 'function') timer.unref()
        return () => clearTimeout(timer)
      }, [toast])
      if (toast === null || toast === undefined) return null
      return h(
        'div',
        {
          className: toast.tone === 'error' ? 'ezuse-toast ezuse-toast--error' : 'ezuse-toast',
          role: 'status',
          'aria-live': 'polite',
        },
        toast.message,
        h('style', null, CSS),
      )
    }

    /** Read every registered workspace with its extra roots. */
    async function readWorkspaces() {
      const response = await fetch('/ezuse/workspaces', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      if (response.ok === false) return null
      try {
        const payload = await response.json()
        return payload !== null && payload.ok === true ? payload : null
      } catch {
        return null
      }
    }

    /** Mount/unmount one directory for a workspace directory (no session needed). */
    async function writeWorkspaceRoots(workspacePath, action, path) {
      const response = await fetch('/ezuse/roots', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-dsh-ezuse': '1' },
        body: JSON.stringify({ workspace: String(workspacePath), action, path }),
      })
      if (response.ok === false) throw new Error(response.status === 404 ? 'route-missing' : `HTTP ${response.status}`)
      const payload = await response.json()
      if (payload === null || payload.ok !== true) throw new Error((payload && payload.error) || 'failed')
      return payload
    }

    /**
     * The 项目目录 main panel: every workspace, its mounted directories, and one
     * mount button each. This is the workspace-level surface — the workspace row's
     * own "..." menu is not an extension point in this composition.
     */
    function EzusePanel(props) {
      const [state, setState] = React.useState({ status: 'loading' })
      const [busy, setBusy] = React.useState(false)
      const workspaces =
        typeof props.useWorkspaces === 'function' ? props.useWorkspaces((snapshot) => snapshot.items) : []

      const refresh = async () => {
        setState({ status: 'loading' })
        const payload = await readWorkspaces()
        setState(payload === null ? { status: 'error' } : { status: 'ready', data: payload })
      }

      React.useEffect(() => {
        void refresh()
      }, [])

      const rowsFor = (workspacePath) => {
        const found = state && state.data ? state.data.workspaces.find((entry) => entry.path === workspacePath) : undefined
        return found === undefined ? [] : found.roots
      }

      const mount = async (workspacePath) => {
        setBusy(true)
        try {
          const picker = typeof props.pickDirectory === 'function' ? props.pickDirectory : pickDirectory
          const picked = await picker()
          if (picked === null || picked === undefined) return
          await writeWorkspaceRoots(workspacePath, 'add', picked)
          showToast('ok', format(translation('toastAdded'), { path: picked }))
          await refresh()
        } catch (error) {
          showToast('error', format(translation('toastFailed'), { reason: String((error && error.message) || error) }))
        } finally {
          setBusy(false)
        }
      }

      const unmount = async (workspacePath, root) => {
        setBusy(true)
        try {
          await writeWorkspaceRoots(workspacePath, 'remove', root)
          await refresh()
        } catch (error) {
          showToast('error', format(translation('toastFailed'), { reason: String((error && error.message) || error) }))
        } finally {
          setBusy(false)
        }
      }

      const cards = (workspaces || []).map((workspace) => {
        const roots = rowsFor(workspace.path)
        return h(
          'div',
          { className: 'ezuse-roots__card', key: workspace.workspaceId ?? workspace.path },
          h(
            'div',
            { className: 'ezuse-roots__row ezuse-roots__row--primary' },
            h('span', { className: 'ezuse-roots__chip ezuse-roots__chip--primary' }, workspace.title || translation('panelWorkspace')),
            h('code', { className: 'ezuse-roots__path', title: workspace.path }, workspace.path),
            h(
              'button',
              {
                type: 'button',
                className: 'ezuse-roots__button',
                disabled: busy,
                onClick: () => void mount(workspace.path),
              },
              translation('panelMount'),
            ),
          ),
          roots.length === 0
            ? h('p', { className: 'ezuse-roots__empty' }, translation('panelEmpty'))
            : roots.map((root) =>
                h(
                  'div',
                  { className: 'ezuse-roots__row', key: root.path },
                  h('code', { className: 'ezuse-roots__path', title: root.path }, root.path),
                  root.exists === false ? h('span', { className: 'ezuse-roots__chip ezuse-roots__chip--warn' }, translation('missing')) : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ezuse-roots__button ezuse-roots__button--quiet',
                      disabled: busy,
                      onClick: () => void unmount(workspace.path, root.path),
                    },
                    translation('remove'),
                  ),
                ),
              ),
        )
      })

      if (state.status === 'loading') {
        return h('section', { className: 'ezuse-roots' }, h('p', { className: 'ezuse-roots__facts' }, translation('loading')), h('style', null, CSS))
      }
      if (state.status === 'error') {
        return h(
          'section',
          { className: 'ezuse-roots' },
          h('p', { className: 'ezuse-roots__error' }, format(translation('failed'), { reason: 'unavailable' })),
          h('style', null, CSS),
        )
      }

      return h(
        'section',
        { className: 'ezuse-roots' },
        h(
          'div',
          { className: 'ezuse-roots__head' },
          h(
            'div',
            null,
            h('h2', { className: 'ezuse-roots__title' }, translation('panelTitle')),
            h('p', { className: 'ezuse-roots__intro' }, translation('panelIntro')),
          ),
          h(
            'div',
            { className: 'ezuse-roots__actions' },
            h('button', { type: 'button', className: 'ezuse-roots__button', onClick: () => void refresh(), disabled: busy }, translation('refresh')),
          ),
        ),
        cards.length === 0 ? h('p', { className: 'ezuse-roots__empty' }, translation('panelNoWorkspaces')) : h('div', { className: 'ezuse-settings__card' }, cards),
        h('style', null, CSS),
      )
    }

    /** The sidebar icon that opens the panel; the sidebar owns the button itself. */
    function EzusePanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('path', {
          d: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3V7zm0 3h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z',
          fill: 'currentColor',
          opacity: props.active === true ? 1 : 0.75,
        }),
      )
    }

    let translation = (key) => key
    let pickDirectory = async () => null
    RootsView.displayName = 'EzuseRootsView'

    return {
      inject: ['slots', 'locale'],

      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-ezuse: roots dictionaries')
        translation = ctx.locale.bind(NS)
        pickDirectory = async () => {
          const uiWorkspace = ctx.get('uiWorkspace')
          if (uiWorkspace === undefined || typeof uiWorkspace.pickDirectory !== 'function') return null
          return await uiWorkspace.pickDirectory()
        }

        ctx.slots.inject('conversation.view', () =>
          ctx.slots.register(
            {
              name: 'conversation.view',
              id: 'ezuse-roots',
              order: 20,
              label: () => translation('tab'),
              locale: NS,
              inject: () => ({ pickDirectory }),
            },
            RootsView,
          ),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'ezuse',
              order: 25,
              label: () => translation('settingsNav'),
              locale: NS,
            },
            EzuseSettings,
          ),
        )



        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'ezuse-notify',
              order: 10,
              inject: () => ({
                openSession: (sessionId) => {
                  const uiWorkspace = ctx.get('uiWorkspace')
                  if (uiWorkspace !== undefined && typeof uiWorkspace.openSession === 'function') {
                    uiWorkspace.openSession(sessionId)
                  }
                },
              }),
            },
            NotifyWatcher,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'ezuse-toast', order: 20 }, EzuseToast),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'ezuse' }, EzusePanel),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'ezuse',
              order: 20,
              label: () => translation('panelNav'),
            },
            EzusePanelIcon,
          ),
        )
      },
    }
  },
})
