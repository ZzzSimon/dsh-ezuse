/**
 * Development entry: load a FRESH module generation of `index.js` without
 * restarting DSH.
 *
 * Why this exists: Node's ES module cache is keyed by URL, so an installed
 * plugin's `index.js` is evaluated once per process. Editing it, re-enabling the
 * row, or reinstalling the bundle all reuse that first generation — which is why
 * a code change normally waits for a restart. A *different URL* is a different
 * module, and the Loader row's `name` is what decides the URL.
 *
 * Usage (profile patch, with the normal row disabled so the plugin is mounted
 * once):
 *
 * ```yaml
 * - id: dsh-ezuse
 *   disabled: true
 * - insert:
 *     - id: dsh-ezuse-dev
 *       name: "dsh-ezuse/dev.js?v=1"
 * ```
 *
 * After editing `index.js` (or any file it imports), raise the version number in
 * that row's `name` (`?v=1` → `?v=2`). Profile patch edits are reconciled into
 * the running Loader, so this row is resolved anew — a new `dev.js` URL, whose
 * own dynamic import carries the same version, so the whole graph is re-read.
 *
 * The version reaches `index.js` through the query string, so this file never
 * needs editing: `import.meta.url` of the *row* is `...?v=N`, and that `N` is
 * forwarded to the module URL this file imports.
 */
const REVISION = new URL(import.meta.url).searchParams.get('v') ?? 'dev'
const module = await import(`./index.js?v=${encodeURIComponent(REVISION)}`)

export const name = module.name
export const inject = module.inject
export const apply = module.apply
export const Config = module.Config
export const { handleCommand, renderPromptContext, describeWorkspace, mutateWorkspace, pathKey } = module
export default module.default
