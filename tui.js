// src/lib/board.tsx
import { For, Show, onCleanup } from "solid-js";

// src/lib/format.ts
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

// src/lib/theme.ts
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

// src/lib/board.tsx
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
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
function build(key, sample, config, sampler) {
  const width = config.sparkWidth;
  switch (key) {
    case "cpu": {
      const value = sample?.cpu;
      return {
        label: LABELS.cpu,
        spark: sparkline(sampler.history("cpu"), width, { max: 25 }),
        value: percent(value),
        tone: heat(value, 70, 90),
        sparkTone: "accent"
      };
    }
    case "cputemp": {
      const value = sample?.cpuTemp;
      return {
        label: LABELS.cputemp,
        spark: sparkline(sampler.history("cputemp"), width, { min: 30, max: 100 }),
        value: temperature(value),
        tone: heat(value, 80, 95),
        sparkTone: heat(value, 80, 95)
      };
    }
    case "mem": {
      const value = sample?.memPct;
      const used = gigabytes(sample?.memUsed);
      const total = gigabytes(sample?.memTotal);
      return {
        label: LABELS.mem,
        spark: sparkline(sampler.history("mem"), width, { max: 100 }),
        value: `${percent(value)} ${used}/${total}`,
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
        spark: sparkline(sampler.history("temp"), width, { min: 30, max: 95 }),
        value: temperature(value),
        tone: heat(value, 75, 90),
        sparkTone: heat(value, 75, 90)
      };
    }
    case "gpu": {
      const value = sample?.gpu;
      return {
        label: LABELS.gpu,
        spark: sparkline(sampler.history("gpu"), width, { max: 25 }),
        value: percent(value),
        tone: heat(value, 85, 97),
        sparkTone: "accent"
      };
    }
    case "gputemp": {
      const value = sample?.gpuTemp;
      return {
        label: LABELS.gputemp,
        spark: sparkline(sampler.history("gputemp"), width, { min: 30, max: 100 }),
        value: temperature(value),
        tone: heat(value, 85, 98),
        sparkTone: heat(value, 85, 98)
      };
    }
    case "net": {
      return {
        label: LABELS.net,
        spark: sparkline(sampler.history("netIn"), width, { max: 2 * 1024 * 1024 }),
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
function StatsBoard(props) {
  const unsubscribe = props.sampler.subscribe();
  onCleanup(unsubscribe);
  const colors = () => palette(props.theme);
  const sample = () => {
    props.sampler.tick();
    return props.sampler.current();
  };
  const peaks = () => {
    props.sampler.tick();
    return props.sampler.peaks();
  };
  const lines = () => {
    props.sampler.tick();
    const current = props.sampler.current();
    return props.config.rows.map((key) => build(key, current, props.config, props.sampler));
  };
  const chip = () => {
    const system = sample()?.system;
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
    const current = sample();
    const top = peaks();
    return [
      clock("P", current?.freqP, top.p),
      clock("S", current?.freqS, top.s),
      clock("G", current?.freqG, top.g)
    ].join(" ");
  };
  return /* @__PURE__ */ jsxs("box", { flexDirection: "column", gap: 0, children: [
    /* @__PURE__ */ jsx("text", { fg: colors().primary, children: /* @__PURE__ */ jsx("b", { children: chip() }) }),
    /* @__PURE__ */ jsx("text", { fg: colors().muted, children: clocks() }),
    /* @__PURE__ */ jsxs(Show, { when: sample() !== void 0, fallback: /* @__PURE__ */ jsx("text", { fg: colors().muted, children: "measuring\u2026" }), children: [
      /* @__PURE__ */ jsx(For, { each: lines(), children: (line) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsx("text", { fg: colors().muted, children: line.label.padEnd(6) }),
        /* @__PURE__ */ jsx(Show, { when: line.spark, children: (spark) => /* @__PURE__ */ jsx("text", { fg: color(colors(), line.sparkTone), children: spark() }) }),
        /* @__PURE__ */ jsx("text", { fg: color(colors(), line.tone), children: line.value })
      ] }) }),
      /* @__PURE__ */ jsx(Show, { when: sample()?.error, children: (error) => /* @__PURE__ */ jsx("text", { fg: colors().warning, children: error() }) })
    ] })
  ] });
}

// src/lib/config.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  const here = dirname(fileURLToPath(import.meta.url));
  for (const directory of [here, dirname(here), dirname(dirname(here))]) {
    try {
      return JSON.parse(readFileSync(join(directory, "config.json"), "utf8"));
    } catch {
      continue;
    }
  }
  return {};
}
function loadConfig(options) {
  const merged = { ...readFileConfig(), ...options ?? {} };
  return {
    port: integer(merged.port, DEFAULTS.port, 1024, 65535),
    intervalMs: integer(merged.intervalMs, DEFAULTS.intervalMs, 500, 15e3),
    diskPath: typeof merged.diskPath === "string" && merged.diskPath ? merged.diskPath : DEFAULTS.diskPath,
    rows: rows(merged.rows, DEFAULTS.rows),
    history: integer(merged.history, DEFAULTS.history, 8, 240),
    sparkWidth: integer(merged.sparkWidth, DEFAULTS.sparkWidth, 6, 16)
  };
}

// src/lib/sampler.ts
import { statfsSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { createSignal } from "solid-js";

// src/lib/mactop.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";

// src/lib/prom.ts
function parseMetrics(text) {
  const out = /* @__PURE__ */ new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const split = line.lastIndexOf(" ");
    if (split <= 0) continue;
    const key = line.slice(0, split).trim();
    const value = Number(line.slice(split + 1));
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
    const matches = Object.entries(labels).every(
      ([label, wanted]) => key.includes(`${label}="${wanted}"`)
    );
    if (matches) return value;
  }
  return void 0;
}

// src/lib/mactop.ts
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
  return path.split(separator).filter((directory) => directory.length > 0).some((directory) => existsSync(join2(directory, "mactop")));
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
var MactopSource = class {
  intervalMs;
  port;
  child;
  stream = new JsonStream();
  latest;
  missing = false;
  failure;
  launching;
  stopped = false;
  constructor(port, intervalMs) {
    this.port = port;
    this.intervalMs = intervalMs;
  }
  get error() {
    if (this.missing) return "mactop not installed";
    return this.failure;
  }
  /** Latest parsed JSON object (bursty: mactop buffers stdout). */
  latestJson() {
    return this.latest;
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
    const json = this.latest;
    if (!metrics && !json) return void 0;
    return { metrics, json };
  }
  stop() {
    this.stopped = true;
    const child = this.child;
    this.child = void 0;
    if (child) {
      debug("stopping mactop", child.pid);
      child.kill();
    } else {
      debug("stop called with no tracked child");
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
    return this.scrape(port).then(
      (metrics) => metrics !== void 0,
      () => false
    );
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
    for (let candidate = base; candidate < base + 5; candidate++) {
      if (await this.probe(candidate)) {
        await sleep(500);
        if (!await this.probe(candidate)) {
        } else {
          fallback ??= candidate;
          continue;
        }
      }
      const child = spawn(
        "mactop",
        ["-p", `:${candidate}`, "--headless", "--format", "json", "--interval", String(this.intervalMs)],
        // stdout is the sample stream; stderr is only diagnostics. Never
        // leave stdout unread: mactop writes a JSON blob per interval.
        { stdio: ["ignore", "pipe", "ignore"] }
      );
      let spawnError;
      child.on("error", (error) => {
        spawnError = error;
      });
      child.on("exit", () => {
        if (this.child === child) this.child = void 0;
      });
      this.attachStream(child);
      const ready = await this.waitForReady(candidate, () => spawnError);
      if (!ready) {
        debug("mactop not ready on port", candidate, spawnError?.message);
        child.kill();
        this.child = void 0;
        continue;
      }
      this.child = child;
      this.port = candidate;
      this.failure = void 0;
      debug("mactop ready", { pid: child.pid, port: candidate });
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
  attachStream(child) {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      for (const parsed of this.stream.push(chunk)) {
        this.latest = parsed;
      }
    });
  }
  async waitForReady(port, spawnError) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.stopped) return false;
      const error = spawnError();
      if (error && error.code === "ENOENT") {
        this.missing = true;
        return false;
      }
      if (this.latest) return true;
      if (await this.probe(port)) return true;
      await sleep(120);
    }
    return false;
  }
};

// src/lib/sampler.ts
var GIGABYTE = 1024 ** 3;
var KILOBYTE = 1024;
var positive = (value) => value !== void 0 && value > 0 ? value : void 0;
function createSampler(config) {
  const [tick, setTick] = createSignal(0);
  const history = /* @__PURE__ */ new Map();
  const peaks = { p: 0, s: 0, g: 0 };
  const source = new MactopSource(config.port, Math.min(config.intervalMs, 1e3));
  let system;
  let current;
  let timer;
  let subscribers = 0;
  let sampling = false;
  let previousCpu;
  let disposed = false;
  const record = (key, value) => {
    if (value === void 0 || !Number.isFinite(value)) return;
    const series = history.get(key) ?? [];
    series.push(value);
    if (series.length > config.history) series.splice(0, series.length - config.history);
    history.set(key, series);
  };
  const cpuUsage = () => {
    const totals = cpus().reduce(
      (result, cpu) => {
        const total2 = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
        return { idle: result.idle + cpu.times.idle, total: result.total + total2 };
      },
      { idle: 0, total: 0 }
    );
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
    return volumes.reduce(
      (best, volume) => (volume.total_gb ?? 0) > (best.total_gb ?? 0) ? volume : best
    );
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
    return { freqP, freqS, freqG };
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
    const memTotal = metric(metrics, "mactop_memory_gb", { type: "total" });
    const memUsed = metric(metrics, "mactop_memory_gb", { type: "used" });
    const socTemp = positive(metric(metrics, "mactop_soc_temp_celsius"));
    const netIn = metric(metrics, "mactop_network_kbytes_per_sec", { direction: "download" });
    const netOut = metric(metrics, "mactop_network_kbytes_per_sec", { direction: "upload" });
    const volume = json ? bootVolume(json) : void 0;
    return {
      at: Date.now(),
      cpu: positive(metric(metrics, "mactop_cpu_usage_percent")) ?? 0,
      cpuTemp: positive(metric(metrics, "mactop_temp_sensor_celsius", { key: "TCDX" })) ?? positive(metric(metrics, "mactop_temp_sensor_celsius", { key: "TCHP" })) ?? socTemp,
      memUsed: positive(memUsed),
      memTotal: positive(memTotal),
      memPct: memTotal && memUsed && memTotal > 0 ? memUsed / memTotal * 100 : void 0,
      pressure: positive(metric(metrics, "mactop_memory_pressure_approx")),
      temp: socTemp,
      gpu: positive(metric(metrics, "mactop_gpu_usage_percent")) ?? 0,
      gpuTemp: positive(metric(metrics, "mactop_gpu_temp_celsius")),
      power: positive(metric(metrics, "mactop_power_watts", { component: "total" })),
      netIn: netIn === void 0 ? void 0 : netIn * KILOBYTE,
      netOut: netOut === void 0 ? void 0 : netOut * KILOBYTE,
      // Clocks and chip identity only exist in the JSON stream, which
      // flushes in bursts — merge the newest object when we have it.
      ...json ? trackPeaks(json) : { freqG: positive(metric(metrics, "mactop_gpu_freq_mhz")) },
      ...volume && volume.total_gb ? {
        diskUsedPct: volume.used_percent,
        diskUsed: (volume.used_gb ?? 0) * 1e9,
        diskTotal: volume.total_gb * 1e9
      } : diskFallback(),
      system: json ? remember(json) : system
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
  };
  const sampleOnce = async () => {
    if (sampling || disposed) return;
    sampling = true;
    try {
      const snapshot = await source.sample();
      if (!snapshot) {
        commit(fromOs(source.error));
        return;
      }
      const sample = snapshot.metrics ? fromMetrics(snapshot.metrics, snapshot.json) : fromJson(snapshot.json);
      if (sample.memPct === void 0 && sample.cpuTemp === void 0) return;
      commit(sample);
    } finally {
      sampling = false;
    }
  };
  const start = () => {
    if (timer || disposed) return;
    void sampleOnce();
    timer = setInterval(() => void sampleOnce(), config.intervalMs);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = void 0;
  };
  const subscribe = () => {
    subscribers += 1;
    start();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscribers -= 1;
      if (subscribers === 0) stop();
    };
  };
  return {
    tick,
    current: () => current,
    history: (key) => history.get(key) ?? [],
    peaks: () => peaks,
    subscribe,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      subscribers = 0;
      stop();
      source.stop();
    }
  };
}

// src/tui.tsx
import { jsx as jsx2 } from "@opentui/solid/jsx-runtime";
var tui_default = {
  id: "local.system-stats",
  setup(ctx) {
    const config = loadConfig(ctx.options);
    const sampler = createSampler(config);
    ctx.ui.slot({
      append: "sidebar.content",
      render: () => /* @__PURE__ */ jsx2(StatsBoard, { theme: ctx.theme, sampler, config })
    });
    return () => sampler.dispose();
  }
};
export {
  tui_default as default
};
