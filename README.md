# dsh-ezuse

DeepSeek Harness 的便捷性插件集。第一个功能：**多工作区**。

## 解决什么

DSH 的一个会话只有一个工作区目录：`SessionHeader.cwd` 是 `workspace-write`
的边界，文件围栏和 shell 的写授权都从它派生。于是"一个会话同时改前后端两个仓库"
做不了。

这个插件把额外的目录**挂载**到同一个会话上：

- 文件工具（`write` / `edit`）可写附加目录；
- `pwsh` / `bash` 等受限 shell 也可写附加目录；
- 模型会在运行时上下文里看到附加目录的绝对路径；
- `read-only` 会话不会被放宽，越界写入仍然由原版沙箱拒绝并给出升级提示。

## 使用

三处入口，同一份状态与配置。侧栏的会话行和工作区行都不再挂菜单项——工作区菜单本身不是扩展点（见文末），所以入口集中在下面两处 + 会话内的页签。

**「EZUSE」设置类目**（设置 → EZUSE）：插件唯一的总配置处。当前提供：

- **对话完成时提醒我** — 一轮结束后发一条浏览器通知：标题就是**会话标题**（例如「DSH多工作区插件开发」），正文是「<工作区目录名> · 这一轮已经结束」，**点一下通知回到那个会话**；用会话的 `completionUnread` 作为主触发，`running→idle` 兜底，拿不到标题时退回「对话已完成」；
- **仅当 DSH 页面不可见时提醒** — 默认开。判定用的是 `document.visibilityState`，它只描述**这一个标签页**是否在屏幕上：切到浏览器别的标签页、最小化窗口、切到别的应用都算「不可见」，**照常提醒**；只有你正看着这个对话页时才不打扰。
- **模型提问时提醒我** — 默认开。模型用 `ask_user_question` 提问并停下等你回答时，发一条通知：标题是会话标题，正文是「<工作区名> · 等你回答：<问题原文>」，同样带音效、点一下回到该会话。判定用的是会话状态里的 `pendingInteraction`（`kind` 为 `question` / `plan-review`），按请求 `key` 去重，同一个问题重复渲染不会连发；`approval` 权限确认不算提问，不会触发；
- **提示音** — 下拉三选一：清脆两声（880→1175 Hz）、麦当劳 ba-da-ba-ba-ba（简谱 6̲ 7̲ 1 6 5，1=C5：A4→B4→C5→**A5**→G5，前两个音低八度，第 4 音回到自己的八度形成跳进，最后一音拖长 0.55 秒收尾；三角波 + 起音/保持/释放包络，纯合成无录音）、静音；旁边「试听」立即播放当前选择，「发送」测试会同时弹通知并响该音效；
- **浏览器通知权限** — 显示当前 `granted/denied/default`，一键申请；
- **测试通知** — 确认浏览器真的会弹；
- **最近一次提醒** — 上一次完成时是发了还是跳过、跳过的原因（前台/关闭/无权限），用来解释「怎么没弹」。

命名用的会话事实来自 `GET /ezuse/session?session=<id>`（标题由宿主 `ctx.sessionTitle` 折叠，工作区取 cwd 末段）。配置落在 `<DSH_HOME>/plugin-data/dsh-ezuse/config.json`，面板读写的同样是这个文件（手改也会被下次读取感知）。通知组件是渲染为 `null` 的全局哨兵（`shell.overlay`，root 作用域，监听整张会话状态表），不进对话流。

**侧栏「项目目录」图标 + 独立面板**（`sidebar.panellist` → `main` 面板 key `ezuse`）：列出**所有**工作区（标题 + 路径）与它们已挂载的额外目录，每个工作区一个「挂载目录…」按钮，行内可移除。这是工作区级的管理面：不依赖会话是否在运行，改动对所有在该目录里开的会话生效。数据来自 `GET /ezuse/workspaces`，写操作走 `POST /ezuse/roots { workspace: <路径> }`。成功/失败用插件自己的提示条（右下角，4 秒自动消失）回报。

> 注：**工作区标题行右侧的「...」不是扩展点**——该菜单的项在 `dsh-client-ui-workspace` 里是硬编码的 locale key（`delete.workspace` / `rename.workspace.title` / `menu.addWorkspace`），而 `sidebar.workspaces` 只声明了 4 个槽（会话菜单、会话悬停按钮、directoryFlow、会话行 leading/hover），**没有工作区级别的行/头槽**。所以要「挂到工作区下方」只能改上游包。

**对话区「项目目录」页签**（紧挨「对话 / 轨迹」）：主工作区一行、每个附加目录一行
（带存在状态与「移除」）、「添加目录」（系统文件夹选择框）、「刷新」、「全部移除」，以及
文件写入 / shell 写入是否真的生效。页签与面板通过插件自己的 HTTP 路由读写：

```
GET  /ezuse/roots?session=<会话 id>   读取主工作区 + 附加目录 + 授权状态
POST /ezuse/roots                     add / remove / clear（需 x-dsh-ezuse 头，跨站请求被拒）
GET  /ezuse/session?session=<会话 id>  会话标题 / 工作区名 / 当前模式（通知命名用）
GET  /ezuse/workspaces                所有工作区及其附加目录（面板用）
GET  /ezuse/config                    插件总配置
POST /ezuse/config                    合并配置补丁（同样需要 x-dsh-ezuse 头）
```

**斜杠命令**（聊天流里留下记录，脚本化更方便）：

```
/workspace                 查看主工作区与附加目录
/workspace add             打开系统文件夹选择框，选中即加入
/workspace add <路径>      直接加入已存在的目录（相对路径按主工作区解析）
/workspace remove <序号|路径>
/workspace clear
```

`add` 不带参数时走 DSH 自己的目录选择后端：本机 loopback 访问是系统对话框
（`native`），远程浏览模式没有系统对话框，此时用 `/workspace add <绝对路径>`。

> 宿主插件与浏览器半都在**进程启动时**加载：改完代码要重启一次 DSH（并刷新页面）才会
> 换成新的一代模块，就地保存不会热更。

## 实现

| 文件 | 作用 |
|---|---|
| `index.js` | 插件入口：`/workspace` 命令、运行时上下文、`agent/created` 与 `tools/pre-execute` 钩子、页签与设置用的读写操作 |
| `client.js` | 浏览器半：「项目目录」页签、EZUSE 设置页、对话完成提醒哨兵；全部样式只用主题 token |
| `lib/http.js` | 浏览器与宿主之间的路由：项目目录 + 插件配置（写操作要求同源 `Origin` 与 `x-dsh-ezuse` 头） |
| `lib/config.js` | 插件总配置（通知开关等）：默认值、校验、原子写、外部改动自动重读 |
| `lib/store.js` | 按**工作区目录**持久化附加目录（`<DSH_HOME>/plugin-data/dsh-ezuse/workspace-roots.json`，原子写、外部改动自动重读） |
| `lib/paths.js` | 规范化路径与包含判定（`realpath` 优先，Windows 大小写不敏感，身份回退） |
| `lib/fence.js` | 文件围栏：把同一目录换成附加根重放官方 `writeText` / `editText`，写入、版本守卫、拒绝语义都仍是官方代码 |
| `lib/grants.js` | shell 写授权：给**本工作区的能力 SID** 在附加目录上加 Write ACE（与沙箱给自己的主工作区授权的机制完全相同） |
| `lib/grant-worker.js` | 把 ACE 传播（按对象计费，最贵的一步）搬到 worker 线程，宿主事件循环不被占住 |

为什么页签与设置页自带 HTTP 路由：profile 装进来的插件没有生成的 Remote 命名空间，浏览器半只有
`layout / locale / sessions / slots / theme / timer / uiWorkspace / workspaces` 这几个服务；
所以状态与配置都走插件自己的路由，「添加目录」复用宿主自己的 `uiWorkspace.pickDirectory()`。

设计要点：

- **按工作区记录，而不是按会话**：同一目录里新开、续接、fork 出来的会话共享同一套附加目录。
- **不替换任何官方插件**：围栏是给活的 `ctx.fs` 实例打补丁（卸载时复原），shell 授权复用官方
  `@deepseek-ai/dsh-sandbox-windows-acl` 的 SID 派生与 ACE 写入，失败即降级并报状态。
- **围栏只重放 `workspace-write`**：`read-only` 与 `danger-full-access` 完全不经手。

### shell 授权的代价（为什么第一版会卡）

给目录加可继承 ACE 时，Windows 会把它落到**每个已有子对象**上。实测：

| 操作 | 成本 | 备注 |
|---|---|---|
| 授予（1 目录 + 3000 文件） | 192 ms | ≈ 0.06 ms/对象 |
| 授予（3000 子目录 + 0 文件） | 292 ms | 对象计费，目录也算 |
| 撤销（8000 文件） | 876 ms | ≈ 0.1 ms/对象 |
| **ACE 已存在时再授予** | **1 ms** | 命中 ACL 包的 exact-ACE 跳过 |

注意：dd(dir) 只是**一次** SetNamedSecurityInfoW，给目录一条 (OI)(CI) 可继承 ACE——代码里没有逐文件循环。逐个落下去的是 Windows 的继承 materialization：可继承 ACE 只自动作用于**新建**子对象，要让**已存在**的上千个对象也覆盖，系统必须改写每个子对象的 DACL。想避开它只能放弃这层管控（见下面的开关）。

所以这一层现在照抄 harness 自己的姿势：**standing 授权，一次为准**（`AclWriteGrant.add(path, true)`
后立即释放句柄，ACE 留在目录上），重启后再次挂载命中 1 ms 快速路径；只有**移除目录**时才显式撤销，
撤销走一次性的可撤销句柄。另外传播全部挪进 `lib/grant-worker.js` 的 worker 线程，面板的请求先返回：

```
POST add    6000 文件仓库 → 8 ms 返回（响应里 shell.pending = true）
            后台授予在 ~0.5 s 内完成（期间界面不卡）
POST remove 同一目录      → 34 ms 返回，撤销在 ~0.5 s 内完成，capability ACE 归零
```

**新建的对象不需要再授权**：ACE 是 (OI)(CI) 可继承的，pnpm install / git checkout / 构建产生的文件在**创建那一刻**就带上了 (I)(W,D,DC)（子目录是 (I)(OI)(CI)(W,D,DC)），不会再有任何遍历。实测：挂载一次 128 ms，之后新建 500+ 个文件 75 ms、零次授权调用。只有**挂载之前就存在**的对象需要那一次传播。需要手工补的情况只有一种：对象被以「断开继承」方式创建（SE_DACL_PROTECTED、icacls /inheritance:r、obocopy /COPYALL），这类对象收不到继承 ACE。

**能不能更快？** 遍历本身加速不了，三条实测否决：

| 方案 | 结果 |
|---|---|
| 8 线程并行分治兄弟子树（4809 对象） | 487 ms vs 串行 447 ms → **0.9×**，内核的 DACL 传播是串行的 |
| 换系统 `icacls /grant /T`（每对象 1 条 ACE，我们的是 3 条） | 830 ms → **更慢**，瓶颈是每对象的 DACL 读写，不是编辑条数 |
| 只给目录、不落文件 | 已有文件仍不可写（`pnpm install` / `git pull` 全废） |

真正有效的只有「少付」：不适用时零成本（下面那条）、一次为准（standing）、以及**只挂要写的子目录**——
成本 ∝ 对象数，916k 文件的仓库首次约 46 秒，挂 `src/` 通常不到 1 秒。

另外：**只有 `workspace-write` 会话才写 ACE**。ead-only（token 里没有写 SID）和 danger-full-access（shell 本来不受限）下这条授权是惰性的，写它等于白走一次遍历——比如一个 916k 文件的仓库要 46 秒。

两个开关（环境变量，宿主启动时读）：

- `DSH_EZUSE_SHELL_GRANTS=0` — 完全不做 shell 授权，只保留文件工具可写（面板里会写明原因）。
- `DSH_EZUSE_REVOKE_ON_UNLOAD=1` — 插件卸载时撤销全部授权（默认保留，当作复用缓存）。

已知残留：撤销会移除**写能力 ACE**（真正决定能不能写的那个），但 ACL 模块给目录打的
Low 完整性标签会留下——和 harness 对它自己工作区根目录的处理一致。要彻底恢复原状得手工
`icacls` 清理。

## 开发入口：改代码不用重启

宿主插件按**模块 URL** 缓存：同一个 `index.js` 一个进程只求值一次，所以就地改代码、重新
启用插件行、甚至重装 bundle，都还是那一代模块（装新包不受影响，那是新的 URL）。`hmr` 默认
`root: []`，也不监听插件源码。

`dev.js` 就是绕开这一点的入口——它把插件行自带的版本号转发给 `index.js`：

```js
const REVISION = new URL(import.meta.url).searchParams.get('v') ?? 'dev'
const module = await import(`./index.js?v=${encodeURIComponent(REVISION)}`)
```

用的时候在 profile 的 `cordis.patch.yml` 里停用正常行、挂载开发行：

```yaml
- id: dsh-ezuse
  disabled: true
- insert:
    - id: dsh-ezuse-dev
      name: "file:///C:/Users/USER/code/dsh-ezuse/dev.js?v=2"
```

改完 `index.js`（或它 import 的任何文件）把 `?v=1` 加一，**保存 patch 即生效**：patch 变更会
被热重组，行名变了 → 新的 `dev.js` URL → 新的一代模块。

两个实测坑：

- **必须用 `file://` URL，不能用 `dsh-ezuse/dev.js?v=1`**：加载器按包名解析时 `?v` 过不了
  `exports`（实测该行停在 `fiberPhase: null`），`file://` 直接交给 ESM 加载器，query 会保留。
- **`client.js` 不需要这条开发行**：它由客户端插件服务按清单提供，不经过 Loader 行；改完刷新
  页面即可。

开发行是机器相关的绝对路径，属于**开发态**；发布用的 `cordis.patch.yml`（bundle 自带的那份）
仍然只挂普通行 `dsh-ezuse`。

## 验证

```powershell
npm test      # 全部 6 组
node test/pure-layers.test.mjs   # 路径身份 + 持久化
node test/plugin.test.mjs        # apply() + /workspace + 围栏重放（mock 宿主）
node test/http.test.mjs          # 项目目录 + 配置两组路由 + 写操作鉴权
node test/client.test.mjs        # 页签/设置页/通知哨兵（最小 React 替身）
node test/dev-entry.test.mjs     # 开发入口的版本转发（两代模块必须不同）
node test/mode-gate.test.mjs     # 权限模式门控（workspace-write 才授权）
node test/config.test.mjs        # 总配置：默认值/合并/校验/外部改动
node test/grants.test.mjs        # 真实 Windows ACL 授权/回收（需能找到官方 ACL 包）
```

`grants.test.mjs` 需要 `@deepseek-ai/dsh-sandbox-windows-acl`：默认从宿主进程的执行路径向上找，
找不到时用 `DSH_EZUSE_ACL_MODULE=<pkg>/lib/index.js` 指定；仍找不到则跳过而非失败。

人工验收：

1. `/workspace add` 选一个别的目录；
2. 在该目录里 `write` 一个文件 → 成功；
3. 切到 `workspace-write` 权限，`pwsh` 在该目录里写文件 → 成功；切到 `read-only` → 被拒；
4. `/workspace remove 1` 后同样的写入 → 回到原版拒绝。

## 已知边界

- **改代码默认要重启**：模块按 URL 缓存；要免重启就用上面的开发入口行（`?v` 加一）。
- 只在 Windows 上做 shell 写授权；其他平台文件工具可写，`pwsh`/`bash` 仍只限主工作区，
  命令输出里会写明未生效。
- `present` / 侧栏文件树等按单个工作区列出文件的界面不会感知附加目录；用绝对路径访问。
- shell 授权会真实修改附加目录的 DACL（写入 ACE + 低完整性标签 + 删除防护），这与沙箱对
  主工作区的做法一致；移除目录时会回收。
