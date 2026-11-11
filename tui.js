// .build/tui.js
import { createComponent as _$createComponent2 } from "@opentui/solid";

// .build/lib/board.js
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { For, Show, createMemo, onCleanup } from "solid-js";

// .build/lib/format.js
var SPARK = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
function sparkline(values, width, scale = {}) {
  if (values.length === 0) return " ".repeat(width);
  const window = values.slice(-width);
  const min = scale.min ?? 0;
  const max = Math.max(scale.max ?? Math.max(...window), min + 1e-9);
  const glyphs = window.map((value) => {
    const ratio = (value - min) / (max - min);
    const index = Math.max(0, Math.min(SPARK.length - 1, Math.round(ratio * (SPARK.length - 1))));
    return SPARK[index];
  });
  return " ".repeat(Math.max(0, width - glyphs.length)) + glyphs.join("");
}
function percent(value, digits = 0) {
  if (value === void 0 || !Number.isFinite(value)) return "\u2014";
  return `${value.toFixed(digits)}%`;
}
function temperature(value) {
  if (value === void 0 || !Number.isFinite(value)) return "\u2014";
  return `${Math.round(value)}\xB0C`;
}
function watts(value) {
  if (value === void 0 || !Number.isFinite(value)) return "\u2014";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}W`;
}
function gigabytes(value) {
  if (value === void 0 || !Number.isFinite(value)) return "\u2014";
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)}G`;
}
function gigahertz(megahertz) {
  if (megahertz === void 0 || !Number.isFinite(megahertz) || megahertz <= 0) return "\u2014";
  const giga = megahertz / 1e3;
  return giga >= 1 ? giga.toFixed(1) : giga.toFixed(2);
}
function rate(bytesPerSecond) {
  if (bytesPerSecond === void 0 || !Number.isFinite(bytesPerSecond)) return "\u2014";
  const value = Math.abs(bytesPerSecond);
  if (value < 1024) return `${Math.round(value)}B`;
  const kilobytes = value / 1024;
  if (kilobytes < 1024) return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)}K`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)}M`;
  return `${(megabytes / 1024).toFixed(1)}G`;
}
function bytes(value) {
  if (value === void 0 || !Number.isFinite(value)) return "\u2014";
  const units = ["B", "K", "M", "G", "T"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled >= 100 || unit === 0 ? Math.round(scaled) : scaled.toFixed(1)}${units[unit]}`;
}
function bar(value, width) {
  const ratio = value === void 0 || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const filled = Math.round(ratio * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(Math.max(0, width - filled));
}

// .build/lib/theme.js
function feedback(theme, kind) {
  const entry = theme.text.feedback?.[kind];
  return entry?.base ?? entry?.default;
}
function palette(theme) {
  const resolved = theme;
  const text = resolved.text.default ?? resolved.text.base;
  return {
    text,
    muted: resolved.text.subdued ?? resolved.text.muted ?? text,
    primary: resolved.text.action?.primary?.base ?? resolved.text.action?.primary?.default ?? text,
    success: feedback(resolved, "success") ?? text,
    warning: feedback(resolved, "warning") ?? text,
    error: feedback(resolved, "error") ?? text
  };
}

// .build/lib/debug.js
import { appendFile, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var LOG = join(tmpdir(), "system-stats-heartbeat.log");
var ROTATE_AT = 1e6;
var RECHECK_MS = 3e4;
var checkedAt = 0;
var enabled = false;
var written = 0;
function pluginRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, "config.json")) ? here : dirname(dirname(here));
}
function tracing() {
  const now = Date.now();
  if (now - checkedAt >= RECHECK_MS) {
    checkedAt = now;
    enabled = existsSync(join(pluginRoot(), "debug.flag"));
  }
  return enabled;
}
function trace(message) {
  if (!tracing()) return;
  const line2 = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`;
  try {
    written += line2.length;
    if (written > ROTATE_AT) {
      written = 0;
      writeFileSync(LOG, "");
    }
    appendFile(LOG, line2, () => {
    });
  } catch {
  }
}

// .build/lib/board.js
var LABELS = {
  cpu: "CPU",
  cputemp: "CPUTMP",
  mem: "MEM",
  temp: "SOC",
  gpu: "GPU",
  gputemp: "GPUTMP",
  pwr: "PWR",
  net: "NET",
  disk: "DISK"
};
function color(colors, name) {
  switch (name) {
    case "muted":
      return colors.muted;
    case "warn":
      return colors.warning;
    case "error":
      return colors.error;
    case "ok":
      return colors.success;
    case "accent":
      return colors.primary;
    default:
      return colors.text;
  }
}
function heat(value, warn, critical) {
  if (value === void 0) return "muted";
  if (value >= critical) return "error";
  if (value >= warn) return "warn";
  return "text";
}
function line(row, sample, config, sampler) {
  const width = config.sparkWidth;
  switch (row) {
    case "cpu": {
      const value = sample?.cpu;
      return {
        label: LABELS.cpu,
        spark: sparkline(sampler.history("cpu"), width, {
          max: 25
        }),
        value: percent(value),
        tone: heat(value, 70, 90),
        sparkTone: "accent"
      };
    }
    case "cputemp": {
      const value = sample?.cpuTemp;
      return {
        label: LABELS.cputemp,
        spark: sparkline(sampler.history("cputemp"), width, {
          min: 30,
          max: 100
        }),
        value: temperature(value),
        tone: heat(value, 80, 95),
        sparkTone: heat(value, 80, 95)
      };
    }
    case "mem": {
      const value = sample?.memPct;
      return {
        label: LABELS.mem,
        spark: sparkline(sampler.history("mem"), width, {
          max: 100
        }),
        value: `${percent(value)} ${gigabytes(sample?.memUsed)}/${gigabytes(sample?.memTotal)}`,
        tone: heat(value, 80, 92),
        sparkTone: "ok"
      };
    }
    case "pwr": {
      const value = sample?.power;
      return {
        label: LABELS.pwr,
        spark: sparkline(sampler.history("pwr"), width),
        value: watts(value),
        tone: heat(value, 45, 75),
        sparkTone: "warn"
      };
    }
    case "temp": {
      const value = sample?.temp;
      return {
        label: LABELS.temp,
        spark: sparkline(sampler.history("temp"), width, {
          min: 30,
          max: 95
        }),
        value: temperature(value),
        tone: heat(value, 75, 90),
        sparkTone: heat(value, 75, 90)
      };
    }
    case "gpu": {
      const value = sample?.gpu;
      return {
        label: LABELS.gpu,
        spark: sparkline(sampler.history("gpu"), width, {
          max: 25
        }),
        value: percent(value),
        tone: heat(value, 85, 97),
        sparkTone: "accent"
      };
    }
    case "gputemp": {
      const value = sample?.gpuTemp;
      return {
        label: LABELS.gputemp,
        spark: sparkline(sampler.history("gputemp"), width, {
          min: 30,
          max: 100
        }),
        value: temperature(value),
        tone: heat(value, 85, 98),
        sparkTone: heat(value, 85, 98)
      };
    }
    case "net": {
      return {
        label: LABELS.net,
        spark: sparkline(sampler.history("netIn"), width, {
          max: 2 * 1024 * 1024
        }),
        value: `\u2193${rate(sample?.netIn)} \u2191${rate(sample?.netOut)}`,
        tone: "text",
        sparkTone: "accent"
      };
    }
    case "disk": {
      const used = sample?.diskUsedPct;
      return {
        label: LABELS.disk,
        spark: bar(used, width),
        value: `${percent(used)} ${bytes(sample?.diskUsed)}/${bytes(sample?.diskTotal)}`,
        tone: heat(used, 85, 95),
        sparkTone: heat(used, 85, 95)
      };
    }
  }
}
function clock(label, current, peak) {
  if (current === void 0) return `${label} \u2014`;
  if (!peak || peak <= 0) return `${label} ${gigahertz(current)}G`;
  return `${label} ${gigahertz(current)}/${gigahertz(peak)}G`;
}
function Row(props) {
  const colors = () => palette(props.theme);
  const data = createMemo(() => {
    props.sampler.tick();
    return line(props.row, props.sampler.current(), props.config, props.sampler);
  });
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$insertNode(_el$, _el$4);
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "gap", 1);
    _$insert(_el$2, () => LABELS[props.row].padEnd(6));
    _$insert(_el$3, () => data().spark);
    _$insert(_el$4, () => data().value);
    _$effect((_p$) => {
      var _v$ = colors().muted, _v$2 = color(colors(), data().sparkTone), _v$3 = color(colors(), data().tone);
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$4, "fg", _v$3, _p$.a));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0
    });
    return _el$;
  })();
}
function StatsBoard(props) {
  const unsubscribe = props.sampler.subscribe();
  onCleanup(unsubscribe);
  trace(`panel-mount id=${props.sampler.id}`);
  let lastReady;
  onCleanup(() => trace(`panel-unmount id=${props.sampler.id}`));
  const colors = () => palette(props.theme);
  const ready = () => {
    props.sampler.tick();
    const has = props.sampler.current() !== void 0;
    if (has !== lastReady) {
      lastReady = has;
      trace(`panel-ready id=${props.sampler.id} has=${has}`);
    }
    return has;
  };
  const chip = () => {
    props.sampler.tick();
    const system = props.sampler.current()?.system;
    if (!system?.model) return "System";
    const parts = [system.model];
    if (system.cores) {
      const split = system.pCores && system.sCores ? ` (${system.pCores}P+${system.sCores}S)` : "";
      parts.push(`${system.cores}c${split}`);
    }
    if (system.gpuCores) parts.push(`${system.gpuCores}g`);
    return parts.join(" \xB7 ");
  };
  const clocks = () => {
    props.sampler.tick();
    const current = props.sampler.current();
    const peaks = props.sampler.peaks();
    return [clock("P", current?.freqP, peaks.p), clock("S", current?.freqS, peaks.s), clock("G", current?.freqG, peaks.g)].join(" ");
  };
  const error = () => {
    props.sampler.tick();
    return props.sampler.current()?.error;
  };
  return (() => {
    var _el$5 = _$createElement("box"), _el$6 = _$createElement("text"), _el$7 = _$createElement("b"), _el$8 = _$createElement("text");
    _$insertNode(_el$5, _el$6);
    _$insertNode(_el$5, _el$8);
    _$setProp(_el$5, "flexDirection", "column");
    _$setProp(_el$5, "gap", 0);
    _$insertNode(_el$6, _el$7);
    _$insert(_el$7, chip);
    _$insert(_el$8, clocks);
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return ready();
      },
      get fallback() {
        return (() => {
          var _el$9 = _$createElement("text");
          _$insertNode(_el$9, _$createTextNode(`measuring\u2026`));
          _$effect((_$p) => _$setProp(_el$9, "fg", colors().muted, _$p));
          return _el$9;
        })();
      },
      get children() {
        return _$createComponent(For, {
          get each() {
            return props.config.rows;
          },
          children: (row) => _$createComponent(Row, {
            row,
            get theme() {
              return props.theme;
            },
            get sampler() {
              return props.sampler;
            },
            get config() {
              return props.config;
            }
          })
        });
      }
    }), null);
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return error();
      },
      children: (message) => (() => {
        var _el$1 = _$createElement("text");
        _$insert(_el$1, message);
        _$effect((_$p) => _$setProp(_el$1, "fg", colors().warning, _$p));
        return _el$1;
      })()
    }), null);
    _$effect((_p$) => {
      var _v$4 = colors().primary, _v$5 = colors().muted;
      _v$4 !== _p$.e && (_p$.e = _$setProp(_el$6, "fg", _v$4, _p$.e));
      _v$5 !== _p$.t && (_p$.t = _$setProp(_el$8, "fg", _v$5, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$5;
  })();
}

// .build/lib/config.js
import { readFileSync } from "node:fs";
import { basename, dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var ROWS = ["cpu", "cputemp", "mem", "temp", "gpu", "gputemp", "pwr", "net", "disk"];
var DEFAULTS = {
  port: 9110,
  intervalMs: 2e3,
  diskPath: "/",
  rows: ["cpu", "cputemp", "mem", "pwr", "gpu", "gputemp", "net", "disk"],
  history: 24,
  sparkWidth: 10
};
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function integer(value, fallback, min, max) {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback;
}
function rows(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const selected = value.filter((row) => ROWS.includes(row));
  return selected.length > 0 ? [...new Set(selected)] : fallback;
}
function readFileConfig() {
  const here = dirname2(fileURLToPath2(import.meta.url));
  const directories = basename(here) === "lib" ? [here, dirname2(here), dirname2(dirname2(here))] : [here];
  for (const directory of directories) {
    try {
      const parsed = JSON.parse(readFileSync(join2(directory, "config.json"), "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return {};
}
function loadConfig(options) {
  const merged = {
    ...readFileConfig(),
    ...options ?? {}
  };
  return {
    port: integer(merged.port, DEFAULTS.port, 1024, 65535),
    intervalMs: integer(merged.intervalMs, DEFAULTS.intervalMs, 500, 15e3),
    diskPath: typeof merged.diskPath === "string" && merged.diskPath ? merged.diskPath : DEFAULTS.diskPath,
    rows: rows(merged.rows, DEFAULTS.rows),
    history: integer(merged.history, DEFAULTS.history, 8, 240),
    sparkWidth: integer(merged.sparkWidth, DEFAULTS.sparkWidth, 6, 16)
  };
}

// .build/lib/sampler.js
import { statfsSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { createSignal } from "solid-js";

// .build/lib/mactop.js
import { spawn } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";

// .build/lib/prom.js
function parseMetrics(text) {
  const out = /* @__PURE__ */ new Map();
  for (const raw of text.split("\n")) {
    const line2 = raw.trim();
    if (!line2 || line2.startsWith("#")) continue;
    const split = line2.lastIndexOf(" ");
    if (split <= 0) continue;
    const key = line2.slice(0, split).trim();
    const value = Number(line2.slice(split + 1));
    if (!Number.isFinite(value)) continue;
    out.set(key, value);
  }
  return out;
}
function metric(metrics, name, labels) {
  if (!metrics) return void 0;
  const direct = metrics.get(name);
  if (direct !== void 0) {
    if (!labels || Object.keys(labels).length === 0) return direct;
  }
  const prefix = `${name}{`;
  for (const [key, value] of metrics) {
    if (!key.startsWith(prefix)) continue;
    if (!labels) return value;
    const matches = Object.entries(labels).every(([label, wanted]) => key.includes(`${label}="${wanted}"`));
    if (matches) return value;
  }
  return void 0;
}

// .build/lib/mactop.js
var READY_TIMEOUT_MS = 4e3;
var SCRAPE_TIMEOUT_MS = 1200;
var MAX_BUFFER = 1e6;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function debug(...args) {
  if (process.env.OPENCODE_SYSTEM_STATS_DEBUG) console.error("[system-stats]", ...args);
}
function mactopAvailable() {
  const path = process.env.PATH ?? "";
  const separator = process.platform === "win32" ? ";" : ":";
  return path.split(separator).filter((directory) => directory.length > 0).some((directory) => existsSync2(join3(directory, "mactop")));
}
var JsonStream = class {
  buffer = "";
  push(chunk) {
    this.buffer += chunk;
    const objects = [];
    for (; ; ) {
      const start = this.buffer.indexOf("{");
      if (start === -1) {
        this.buffer = "";
        return objects;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);
      const end = this.end(this.buffer);
      if (end === -1) {
        if (this.buffer.length > MAX_BUFFER) this.buffer = "";
        return objects;
      }
      const text = this.buffer.slice(0, end + 1);
      this.buffer = this.buffer.slice(end + 1);
      try {
        objects.push(JSON.parse(text));
      } catch {
      }
    }
  }
  /** Index of the closing brace of the object starting at 0, or -1. */
  end(text) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }
};
var registrySymbol = /* @__PURE__ */ Symbol.for("opencode.system-stats.children");
var reaperSymbol = /* @__PURE__ */ Symbol.for("opencode.system-stats.reaper");
var globalState = globalThis;
var registry = globalState[registrySymbol] ??= /* @__PURE__ */ new Set();
if (!globalState[reaperSymbol]) {
  globalState[reaperSymbol] = true;
  process.once("exit", () => {
    for (const child of registry) {
      try {
        child.kill();
      } catch {
      }
    }
  });
}
function track(child) {
  registry.add(child);
  child.once("exit", () => registry.delete(child));
}
var MactopSource = class {
  stream = new JsonStream();
  latestAt = 0;
  generation = 0;
  missing = false;
  stopped = false;
  constructor(port, intervalMs) {
    this.port = port;
    this.intervalMs = intervalMs;
  }
  get error() {
    if (this.missing) return "mactop not installed";
    return this.failure;
  }
  /** Latest parsed JSON object, dropped once it is clearly stale. */
  latestJson() {
    if (!this.latestAt) return void 0;
    return Date.now() - this.latestAt <= Math.max(3 * this.intervalMs, 5e3) ? this.latest : void 0;
  }
  /**
   * Scrapes `/metrics` for the live rows and returns the newest JSON object
   * alongside it for the fields only the stream carries (chip identity, CPU
   * cluster clocks). Starting the daemon is folded in.
   */
  async sample() {
    let metrics = await this.scrape();
    if (!metrics && !this.missing && !this.stopped) {
      await this.launch();
      metrics = await this.scrape();
    }
    const json = this.latestJson();
    if (!metrics && !json) return void 0;
    return {
      metrics,
      json
    };
  }
  /**
   * One-shot JSON snapshot: chip identity, cluster clocks and volume usage.
   * The streaming child buffers its JSON so those extras can lag by tens of
   * seconds (or never arrive when another instance owns the port and we
   * adopted its metrics-only daemon). ~0.5 s CPU per call, so it is seeded
   * once and refreshed rarely.
   */
  seedJson() {
    if (this.stopped || !mactopAvailable()) return Promise.resolve(void 0);
    return new Promise((resolve) => {
      const child = spawn("mactop", ["--headless", "--format", "json", "--count", "1"], {
        stdio: ["ignore", "pipe", "ignore"]
      });
      this.seedChild = child;
      track(child);
      let output = "";
      const finish = (value) => {
        if (this.seedChild === child) this.seedChild = void 0;
        child.kill();
        resolve(value);
      };
      child.stdout?.on("error", () => {
      });
      const timer = setTimeout(() => finish(void 0), 6e3);
      child.stdout?.on("data", (chunk) => {
        output += chunk.toString("utf8");
      });
      child.on("error", () => {
        clearTimeout(timer);
        finish(void 0);
      });
      child.on("close", () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(output);
          finish(Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed);
        } catch {
          finish(void 0);
        }
      });
    });
  }
  stop() {
    this.stopped = true;
    const child = this.child;
    this.child = void 0;
    if (child) {
      debug("stopping mactop", child.pid);
      child.stdout?.destroy();
      child.kill();
    } else {
      debug("stop called with no tracked child");
    }
    const seed = this.seedChild;
    this.seedChild = void 0;
    if (seed) {
      seed.stdout?.destroy();
      seed.kill();
    }
  }
  url(port = this.port) {
    return `http://127.0.0.1:${port}/metrics`;
  }
  async scrape(port = this.port) {
    try {
      const response = await fetch(this.url(port), {
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS)
      });
      if (!response.ok) return void 0;
      const metrics = parseMetrics(await response.text());
      return metrics.has("mactop_cpu_usage_percent") ? metrics : void 0;
    } catch {
      return void 0;
    }
  }
  probe(port) {
    return this.scrape(port).then((metrics) => metrics !== void 0, () => false);
  }
  async launch() {
    if (this.launching) {
      await this.launching;
      return this.child !== void 0;
    }
    this.launching = this.launchOnce().finally(() => {
      this.launching = void 0;
    });
    await this.launching;
    return this.child !== void 0;
  }
  async launchOnce() {
    if (this.child || this.stopped) return;
    if (!mactopAvailable()) {
      this.missing = true;
      return;
    }
    const base = this.port;
    let fallback;
    for (let candidate = base; candidate <= Math.min(base + 4, 65535); candidate++) {
      if (await this.probe(candidate)) {
        await sleep(500);
        if (!await this.probe(candidate)) {
        } else {
          fallback ??= candidate;
          continue;
        }
      }
      const generation = ++this.generation;
      this.stream = new JsonStream();
      this.latest = void 0;
      this.latestAt = 0;
      const startedAt = Date.now();
      const child = spawn(
        "mactop",
        ["-p", `:${candidate}`, "--headless", "--format", "json", "--interval", String(this.intervalMs)],
        // stdout is the sample stream; stderr is only diagnostics. Never
        // leave stdout unread: mactop writes a JSON blob per interval.
        {
          stdio: ["ignore", "pipe", "ignore"]
        }
      );
      track(child);
      let spawnError;
      child.on("error", (error) => {
        spawnError = error;
      });
      child.on("exit", () => {
        if (this.child === child) this.child = void 0;
      });
      this.attachStream(child, generation);
      const ready = await this.waitForReady(candidate, () => spawnError, startedAt);
      if (!ready) {
        debug("mactop not ready on port", candidate, spawnError?.message);
        child.kill();
        this.child = void 0;
        continue;
      }
      this.child = child;
      this.port = candidate;
      this.failure = void 0;
      debug("mactop ready", {
        pid: child.pid,
        port: candidate
      });
      return;
    }
    if (fallback !== void 0) {
      this.port = fallback;
      this.failure = void 0;
      debug("using an existing mactop on port", fallback, "(metrics only)");
      return;
    }
    this.failure = "mactop failed to start";
  }
  attachStream(child, generation) {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("error", () => {
    });
    child.stdout?.on("data", (chunk) => {
      if (generation !== this.generation) return;
      for (const parsed of this.stream.push(chunk)) {
        this.latest = parsed;
        this.latestAt = Date.now();
      }
    });
  }
  async waitForReady(port, spawnError, startedAt) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.stopped) return false;
      const error = spawnError();
      if (error && error.code === "ENOENT") {
        this.missing = true;
        return false;
      }
      if (this.latest && this.latestAt >= startedAt) return true;
      if (await this.probe(port)) return true;
      await sleep(120);
    }
    return false;
  }
};

// .build/lib/sampler.js
var GIGABYTE = 1024 ** 3;
var KILOBYTE = 1024;
var positive = (value) => value !== void 0 && value > 0 ? value : void 0;
var percentage = (value) => value !== void 0 && Number.isFinite(value) && value >= 0 ? value : void 0;
function createSampler(config, onSample) {
  const id = Math.random().toString(36).slice(2, 8);
  const [tick, setTick] = createSignal(0);
  const history = /* @__PURE__ */ new Map();
  const peaks = {
    p: 0,
    s: 0,
    g: 0
  };
  const source = new MactopSource(config.port, Math.min(config.intervalMs, 1e3));
  let system;
  let current;
  let timer;
  let subscribers = 0;
  let sampling = false;
  let previousCpu;
  let seed;
  let seedTimer;
  let disposed = false;
  const record = (key, value) => {
    if (value === void 0 || !Number.isFinite(value)) return;
    const series = history.get(key) ?? [];
    series.push(value);
    if (series.length > config.history) series.splice(0, series.length - config.history);
    history.set(key, series);
  };
  const cpuUsage = () => {
    const totals = cpus().reduce((result, cpu) => {
      const total2 = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return {
        idle: result.idle + cpu.times.idle,
        total: result.total + total2
      };
    }, {
      idle: 0,
      total: 0
    });
    const previous = previousCpu;
    previousCpu = totals;
    if (!previous) return void 0;
    const idle = totals.idle - previous.idle;
    const total = totals.total - previous.total;
    if (total <= 0) return void 0;
    return Math.max(0, Math.min(100, 100 * (1 - idle / total)));
  };
  const diskFallback = () => {
    const result = {};
    try {
      const stats = statfsSync(config.diskPath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = Math.max(0, total - stats.bfree * stats.bsize);
      result.diskUsedPct = total > 0 ? used / total * 100 : void 0;
      result.diskUsed = used;
      result.diskTotal = total;
    } catch {
    }
    return result;
  };
  const bootVolume = (data) => {
    const volumes = data.volumes ?? [];
    if (volumes.length === 0) return void 0;
    return volumes.reduce((best, volume) => (volume.total_gb ?? 0) > (best.total_gb ?? 0) ? volume : best);
  };
  const temperatureGroup = (data, pattern) => {
    const groups = data.temperatures ?? [];
    const match = groups.find((group) => group.group !== void 0 && pattern.test(group.group));
    return positive(match?.avg_celsius) ?? positive(match?.max_celsius);
  };
  const trackPeaks = (data) => {
    const metrics = data.soc_metrics;
    const freqP = positive(metrics?.p_cluster_freq_mhz);
    const freqS = positive(metrics?.s_cluster_freq_mhz);
    const freqG = positive(metrics?.gpu_freq_mhz);
    if (freqP && freqP > peaks.p) peaks.p = freqP;
    if (freqS && freqS > peaks.s) peaks.s = freqS;
    if (freqG && freqG > peaks.g) peaks.g = freqG;
    return {
      freqP,
      freqS,
      freqG
    };
  };
  const remember = (data) => {
    const info = data.system_info;
    if (info?.name) {
      system = {
        model: info.name,
        cores: info.core_count,
        pCores: info.p_core_count,
        sCores: info.s_core_count,
        gpuCores: info.gpu_core_count
      };
    }
    return system;
  };
  const fromJson = (data) => {
    const memory = data.memory;
    const net = data.net_disk;
    const soc = data.soc_metrics;
    const volume = bootVolume(data);
    const disk = volume && volume.total_gb ? {
      diskUsedPct: volume.used_percent,
      diskUsed: (volume.used_gb ?? 0) * 1e9,
      diskTotal: volume.total_gb * 1e9
    } : diskFallback();
    const memTotal = positive(memory?.total);
    const memUsed = positive(memory?.used);
    return {
      at: Date.now(),
      cpu: data.cpu_usage,
      cpuTemp: temperatureGroup(data, /cpu die|p-core|s-core/i) ?? positive(soc?.cpu_temp),
      memUsed: memUsed === void 0 ? void 0 : memUsed / GIGABYTE,
      memTotal: memTotal === void 0 ? void 0 : memTotal / GIGABYTE,
      memPct: memTotal && memUsed ? memUsed / memTotal * 100 : void 0,
      pressure: memory?.pressure_approx,
      temp: positive(soc?.soc_temp),
      gpu: data.gpu_usage,
      gpuTemp: temperatureGroup(data, /gpu/i) ?? positive(soc?.gpu_temp),
      power: positive(soc?.total_power),
      netIn: net?.in_bytes_per_sec,
      netOut: net?.out_bytes_per_sec,
      ...trackPeaks(data),
      ...disk,
      system: remember(data)
    };
  };
  const fromMetrics = (metrics, json) => {
    const memTotal = metric(metrics, "mactop_memory_gb", {
      type: "total"
    });
    const memUsed = metric(metrics, "mactop_memory_gb", {
      type: "used"
    });
    const socTemp = positive(metric(metrics, "mactop_soc_temp_celsius"));
    const netIn = metric(metrics, "mactop_network_kbytes_per_sec", {
      direction: "download"
    });
    const netOut = metric(metrics, "mactop_network_kbytes_per_sec", {
      direction: "upload"
    });
    const extras = json ?? seed;
    const volume = extras ? bootVolume(extras) : void 0;
    return {
      at: Date.now(),
      cpu: percentage(metric(metrics, "mactop_cpu_usage_percent")),
      cpuTemp: positive(metric(metrics, "mactop_temp_sensor_celsius", {
        key: "TCDX"
      })) ?? positive(metric(metrics, "mactop_temp_sensor_celsius", {
        key: "TCHP"
      })) ?? socTemp,
      memUsed: positive(memUsed),
      memTotal: positive(memTotal),
      memPct: memTotal && memUsed && memTotal > 0 ? memUsed / memTotal * 100 : void 0,
      pressure: positive(metric(metrics, "mactop_memory_pressure_approx")),
      temp: socTemp,
      gpu: percentage(metric(metrics, "mactop_gpu_usage_percent")),
      gpuTemp: positive(metric(metrics, "mactop_gpu_temp_celsius")),
      power: positive(metric(metrics, "mactop_power_watts", {
        component: "total"
      })),
      netIn: netIn === void 0 ? void 0 : netIn * KILOBYTE,
      netOut: netOut === void 0 ? void 0 : netOut * KILOBYTE,
      // Clocks and chip identity only exist in the JSON stream, which
      // flushes in bursts — merge the newest object when we have it.
      ...extras ? trackPeaks(extras) : {
        freqG: positive(metric(metrics, "mactop_gpu_freq_mhz"))
      },
      ...volume && volume.total_gb ? {
        diskUsedPct: volume.used_percent,
        diskUsed: (volume.used_gb ?? 0) * 1e9,
        diskTotal: volume.total_gb * 1e9
      } : diskFallback(),
      system: extras ? remember(extras) : system
    };
  };
  const fromOs = (error) => {
    const total = totalmem();
    const free = freemem();
    return {
      at: Date.now(),
      cpu: cpuUsage(),
      memTotal: total / GIGABYTE,
      memUsed: (total - free) / GIGABYTE,
      memPct: total > 0 ? (total - free) / total * 100 : void 0,
      ...diskFallback(),
      system,
      error
    };
  };
  const commit = (sample) => {
    current = sample;
    record("cpu", sample.cpu);
    record("cputemp", sample.cpuTemp);
    record("mem", sample.memPct);
    record("temp", sample.temp);
    record("gpu", sample.gpu);
    record("gputemp", sample.gpuTemp);
    record("pwr", sample.power);
    record("netIn", sample.netIn);
    record("netOut", sample.netOut);
    record("disk", sample.diskUsedPct);
    setTick((value) => value + 1);
    trace(`id=${id} pid=${process.pid} subs=${subscribers} cpu=${sample.cpu?.toFixed(1)} mem=${sample.memPct?.toFixed(1)} temp=${sample.cpuTemp?.toFixed(1)} pwr=${sample.power?.toFixed(1)} err=${sample.error ?? "-"}`);
    onSample?.();
  };
  const sampleOnce = async () => {
    if (sampling || disposed) return;
    sampling = true;
    try {
      trace(`id=${id} pid=${process.pid} sampling subs=${subscribers} port=${config.port}`);
      const snapshot = await source.sample();
      if (disposed) return;
      trace(`id=${id} snapshot=${snapshot ? Object.keys(snapshot).join("+") : "none"} sourceError=${source.error ?? "-"}`);
      if (!snapshot) {
        commit(fromOs(source.error));
        return;
      }
      const sample = snapshot.metrics ? fromMetrics(snapshot.metrics, snapshot.json) : fromJson(snapshot.json);
      if (sample.memPct === void 0 && sample.cpuTemp === void 0) {
        commit({
          ...sample,
          error: source.error ?? "waiting for mactop metrics"
        });
        return;
      }
      commit(sample);
    } catch (error) {
      trace(`id=${id} sample-error ${error instanceof Error ? error.message : String(error)}`);
      if (!disposed) {
        commit(fromOs(source.error ?? (error instanceof Error ? error.message : "sampler error")));
      }
    } finally {
      sampling = false;
    }
  };
  const refreshSeed = () => {
    void source.seedJson().then((data) => {
      if (data) seed = data;
    });
  };
  const start = () => {
    if (timer || disposed) return;
    refreshSeed();
    seedTimer = setInterval(refreshSeed, 6e4);
    void sampleOnce().catch(() => {
    });
    timer = setInterval(() => void sampleOnce().catch(() => {
    }), config.intervalMs);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    if (seedTimer) clearInterval(seedTimer);
    timer = void 0;
    seedTimer = void 0;
  };
  const subscribe = () => {
    subscribers += 1;
    start();
    let active2 = true;
    return () => {
      if (!active2) return;
      active2 = false;
      subscribers -= 1;
      if (subscribers === 0) stop();
    };
  };
  return {
    id,
    tick,
    current: () => current,
    history: (key) => history.get(key) ?? [],
    peaks: () => peaks,
    subscribe,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      subscribers = 0;
      seed = void 0;
      stop();
      source.stop();
    }
  };
}

// .build/tui.js
var active;
var tui_default = {
  id: "local.system-stats",
  setup(ctx) {
    const config = loadConfig(ctx.options);
    active?.dispose();
    const sampler = createSampler(config, () => ctx.renderer.requestRender());
    active = sampler;
    ctx.ui.slot({
      append: "sidebar.content",
      render: () => _$createComponent2(StatsBoard, {
        get theme() {
          return ctx.theme;
        },
        sampler,
        config
      })
    });
    return () => {
      if (active === sampler) active = void 0;
      sampler.dispose();
    };
  }
};
export {
  tui_default as default
};
