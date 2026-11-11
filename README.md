# opencode-system-stats

Local OpenCode TUI plugin: chip header plus live CPU / memory / power / GPU / network / disk
sparklines appended to the session sidebar, under DCP's "Real Context" block.

```
Apple M5 Max · 18c (12P+6S) · 40g
P 2.1/4.6G S 3.0/3.4G G 0.34/1.3G
CPU        ▃▄▃▄▃▄  10%
CPUTMP     ▂▂▂▂▂▂  39°C
MEM        ▃▃▃▃▃▃  32% 41.3G/128G
PWR        █▅▅▅▅▆  13W
GPU        ▄▄▃▄▄▃  8%
GPUTMP     ▂▂▂▂▂▂  39°C
NET        ▁▁▁▃▁▁  ↓0B ↑0B
DISK   █████████░  90% 1.6T/1.8T
```

Header: chip name, total/performance/efficiency core counts, GPU cores, then per-cluster clocks as
`current/max-observed`. macOS does not expose the DVFS ceiling, so the second number is the highest
clock seen since the plugin loaded — it converges to the hardware maximum under load and resets on
reload.

Rows: `cpu`, `cputemp` (CPU die), `mem` (used % plus used/max GB), `pwr` (package power), `gpu`,
`gputemp`, `net`, `disk`. Optional extra row: `temp` (SoC package temperature).

## How it runs

- Loaded from `~/.config/opencode/plugins/opencode-system-stats/` (discovered by the host, no config entry).
- `tui.js` is the entry (bundled from `src/tui.tsx`); the host resolves `<plugin dir>/tui` and imports it.
- It appends one claim to the `sidebar.content` slot; the built-in Context block and DCP's block are
  separate claims and keep rendering (the slot is multi-tenant).
- One sampler per plugin process, refcounted by sidebar mounts: it starts on the first mount, stops
  polling when the last one unmounts, and is disposed with the plugin.
- Data comes from a supervised `mactop -p :PORT --headless --format json --interval 1000`:
  `/metrics` drives the live rows (CPU, temps, memory, power, GPU, network, disk), while mactop's
  stdout JSON stream supplies what `/metrics` lacks — chip identity, CPU cluster clocks (P/S), volume
  usage. The stream is buffered by mactop, so those fields land a few seconds after start and then
  refresh in bursts. If mactop is missing the panel falls back to `os.cpus()` / `freemem` / `statfs`
  and shows a warning line.

Measured cost on this machine (M5 Max, 18 cores): mactop ≈ 3.2 % of one core at a 1 s sampling
interval, ~47 MB RSS, `/metrics` ready ~0.5 s after spawn.

## Requirements

- macOS (Apple Silicon or Intel) with [mactop](https://github.com/context-labs/mactop) installed:
  `brew install mactop`. It supplies temperatures, CPU/GPU clocks and package power without root.
- OpenCode 2.2.x with TUI plugin support.

## Install

```sh
git clone git@github.com:liviutoma/opencode-system-stats.git \
  ~/.config/opencode/plugins/opencode-system-stats
```

`tui.js` is committed, so no build step is needed. The host discovers the directory at startup and
hot-reloads it on change — no config entry, and **no `node_modules` at runtime** (348 KB installed).

```
~/.config/opencode/plugins/opencode-system-stats/
  tui.js  config.json  README.md  package.json  package-lock.json  tsconfig.json  src/
```

`node_modules` is build/typecheck-only (`npm install --legacy-peer-deps` creates ~271 MB, mostly
`effect`/`opentelemetry`/`typescript`); delete it freely afterwards — runtime imports are provided by
the host. Remove the plugin by deleting the directory (the plugin kills its mactop child on unload).

A **new** slot claim does not appear in an already-mounted sidebar: switch sessions (or restart the
TUI) once after installing/reloading before judging whether it renders.

## Build

```sh
npm install --legacy-peer-deps      # peer conflict between @opencode/plugin and @opentui/solid
npm run build                       # scripts/build.mjs: babel-preset-solid -> esbuild bundle
npm run typecheck
```

The host hot-reloads `tui.js`; no TUI restart needed after a rebuild. After rebuilding you can remove
`node_modules` again.

**Do not build with esbuild's own JSX transform.** `--jsx=automatic` emits runtime `jsx()` calls, and
that runtime evaluates props eagerly: `when={ready()}`, `fg={color(...)}` and `{chip()}` become plain
values computed once at element creation. The panel then renders a static snapshot — it looks like a
sampler or repaint bug (values freeze until switching sessions), but the tree simply never re-runs.
`scripts/build.mjs` instead runs the *same* transform the host uses for its own plugins —
`babel-preset-solid` with `{ moduleName: "@opentui/solid", generate: "universal" }` — which turns
dynamic expressions into getters, then esbuild bundles the result with `solid-js` and
`@opentui/solid/*` kept external.

## Config

`config.json` next to `tui.js` (or the plugin's `options` in config, which win):

```json
{
    "port": 9110,
    "intervalMs": 2000,
    "diskPath": "/",
    "rows": ["cpu", "cputemp", "mem", "pwr", "gpu", "gputemp", "net", "disk"],
    "history": 24,
    "sparkWidth": 10
}
```

- `rows` also controls order; drop entries to hide rows.
- `history` = samples per sparkline, `sparkWidth` = characters (sidebar inner width is 38).
- `intervalMs` clamps to 500–15000 and sets the sidebar cadence; mactop samples at
  `min(intervalMs, 1000)` so the buffered JSON extras arrive promptly.

## Host constraints worth remembering

Verified against OpenCode 2.2.7 (Bun runtime):

1. Bare imports from the plugin **entry file** (`tui.tsx` / `tui.js` at the plugin root) resolve to the
   host's own `solid-js` and `@opentui/solid` — including subpaths like `@opentui/solid/jsx-runtime`.
   A plugin-local `node_modules` does not shadow them.
2. Bare imports from **nested** files fail with `Cannot find package 'solid-js'` unless the plugin has its
   own `node_modules` **and** no `tsconfig.json` in the plugin dir. A tsconfig at the plugin root breaks
   nested bare-import resolution even with `node_modules` present.
3. Hence the bundle: one file at the root, everything else relative. `tsconfig.json` can stay for
   `tsc`, because only the bundle is loaded.
4. `console.error` in plugin setup does not reach `~/.local/share/opencode/log/opencode.log`; use files or
   the plugin's own log to debug. Plugin load failures are logged as `plugin operation failed`.

## Debug

`OPENCODE_SYSTEM_STATS_DEBUG=1` makes the mactop supervisor log spawn/stop/kill events to stderr.
