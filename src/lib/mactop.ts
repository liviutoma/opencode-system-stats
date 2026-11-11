/**
 * Thin supervisor around a headless `mactop` process.
 *
 * mactop is the only macOS source that exposes die temperatures, CPU/GPU clocks
 * and package power without root. Its Prometheus endpoint is cheap, but it only
 * carries GPU frequency — CPU cluster clocks, power, per-group temperatures and
 * volume usage exist solely in the JSON stream that mactop writes to stdout even
 * in `-p` mode. So the JSON stream is the primary source and `/metrics` is the
 * fallback.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseMetrics, type Metrics } from "./prom"

const READY_TIMEOUT_MS = 4000
const SCRAPE_TIMEOUT_MS = 1200
const MAX_BUFFER = 1_000_000

export type MactopJson = {
    readonly soc_metrics?: {
        readonly cpu_power?: number
        readonly gpu_power?: number
        readonly dram_power?: number
        readonly total_power?: number
        readonly gpu_freq_mhz?: number
        readonly p_cluster_freq_mhz?: number
        readonly s_cluster_freq_mhz?: number
        readonly soc_temp?: number
        readonly cpu_temp?: number
        readonly gpu_temp?: number
    }
    readonly memory?: {
        readonly total?: number
        readonly used?: number
        readonly available?: number
        readonly compressed?: number
        readonly swap_used?: number
        readonly pressure_approx?: number
    }
    readonly net_disk?: {
        readonly in_bytes_per_sec?: number
        readonly out_bytes_per_sec?: number
        readonly read_kbytes_per_sec?: number
        readonly write_kbytes_per_sec?: number
    }
    readonly cpu_usage?: number
    readonly gpu_usage?: number
    readonly system_info?: {
        readonly name?: string
        readonly core_count?: number
        readonly p_core_count?: number
        readonly s_core_count?: number
        readonly gpu_core_count?: number
    }
    readonly thermal_state?: string
    readonly temperatures?: ReadonlyArray<{
        readonly group?: string
        readonly avg_celsius?: number
        readonly max_celsius?: number
    }>
    readonly volumes?: ReadonlyArray<{
        readonly name?: string
        readonly total_gb?: number
        readonly used_gb?: number
        readonly used_percent?: number
    }>
}

export type Snapshot = { readonly metrics?: Metrics; readonly json?: MactopJson }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Opt-in tracing: `OPENCODE_SYSTEM_STATS_DEBUG=1` in the host environment. */
function debug(...args: unknown[]) {
    if (process.env.OPENCODE_SYSTEM_STATS_DEBUG) console.error("[system-stats]", ...args)
}

export function mactopAvailable(): boolean {
    // spawn() reports ENOENT asynchronously; a synchronous PATH probe keeps the
    // "not installed" state out of the sampling loop's error path.
    const path = process.env.PATH ?? ""
    const separator = process.platform === "win32" ? ";" : ":"
    return path
        .split(separator)
        .filter((directory) => directory.length > 0)
        .some((directory) => existsSync(join(directory, "mactop")))
}

/**
 * Extracts complete top-level JSON objects from mactop's streaming output.
 * `--count 0` emits one array whose objects arrive incrementally, so a consumer
 * must cut objects out of a partial buffer instead of waiting for valid JSON.
 */
export class JsonStream {
    private buffer = ""

    push(chunk: string): unknown[] {
        this.buffer += chunk
        const objects: unknown[] = []
        for (;;) {
            const start = this.buffer.indexOf("{")
            if (start === -1) {
                this.buffer = ""
                return objects
            }
            if (start > 0) this.buffer = this.buffer.slice(start)
            const end = this.end(this.buffer)
            if (end === -1) {
                if (this.buffer.length > MAX_BUFFER) this.buffer = ""
                return objects
            }
            const text = this.buffer.slice(0, end + 1)
            this.buffer = this.buffer.slice(end + 1)
            try {
                objects.push(JSON.parse(text))
            } catch {
                // A torn object is dropped; the next interval produces a fresh one.
            }
        }
    }

    /** Index of the closing brace of the object starting at 0, or -1. */
    private end(text: string): number {
        let depth = 0
        let inString = false
        let escaped = false
        for (let index = 0; index < text.length; index++) {
            const character = text[index]!
            if (inString) {
                if (escaped) escaped = false
                else if (character === "\\") escaped = true
                else if (character === '"') inString = false
                continue
            }
            if (character === '"') inString = true
            else if (character === "{") depth += 1
            else if (character === "}") {
                depth -= 1
                if (depth === 0) return index
            }
        }
        return -1
    }
}

/**
 * Children outlive the module instance that spawned them when the host crashes
 * or skips plugin cleanup on reload, so the registry lives on `globalThis` and
 * a single `exit` hook reaps whatever is still tracked.
 */
const registrySymbol = Symbol.for("opencode.system-stats.children")
const reaperSymbol = Symbol.for("opencode.system-stats.reaper")
const globalState = globalThis as unknown as Record<symbol, unknown>
const registry = (globalState[registrySymbol] ??= new Set<ChildProcess>()) as Set<ChildProcess>
if (!globalState[reaperSymbol]) {
    globalState[reaperSymbol] = true
    process.once("exit", () => {
        for (const child of registry) {
            try {
                child.kill()
            } catch {
                // already gone
            }
        }
    })
}

function track(child: ChildProcess): void {
    registry.add(child)
    child.once("exit", () => registry.delete(child))
}

export class MactopSource {
    readonly intervalMs: number
    private port: number
    private child: ChildProcess | undefined
    private seedChild: ChildProcess | undefined
    private stream = new JsonStream()
    private latest: MactopJson | undefined
    private latestAt = 0
    private generation = 0
    private missing = false
    private failure: string | undefined
    private launching: Promise<void> | undefined
    private stopped = false

    constructor(port: number, intervalMs: number) {
        this.port = port
        this.intervalMs = intervalMs
    }

    get error(): string | undefined {
        if (this.missing) return "mactop not installed"
        return this.failure
    }

    /** Latest parsed JSON object, dropped once it is clearly stale. */
    latestJson(): MactopJson | undefined {
        if (!this.latestAt) return undefined
        return Date.now() - this.latestAt <= Math.max(3 * this.intervalMs, 5000) ? this.latest : undefined
    }

    /**
     * Scrapes `/metrics` for the live rows and returns the newest JSON object
     * alongside it for the fields only the stream carries (chip identity, CPU
     * cluster clocks). Starting the daemon is folded in.
     */
    async sample(): Promise<Snapshot | undefined> {
        let metrics = await this.scrape()
        if (!metrics && !this.missing && !this.stopped) {
            await this.launch()
            metrics = await this.scrape()
        }
        // A dead daemon leaves its last object behind; refusing to serve it
        // keeps frozen CPU/memory/net numbers from masquerading as live ones.
        const json = this.latestJson()
        if (!metrics && !json) return undefined
        return { metrics, json }
    }

    /**
     * One-shot JSON snapshot: chip identity, cluster clocks and volume usage.
     * The streaming child buffers its JSON so those extras can lag by tens of
     * seconds (or never arrive when another instance owns the port and we
     * adopted its metrics-only daemon). ~0.5 s CPU per call, so it is seeded
     * once and refreshed rarely.
     */
    seedJson(): Promise<MactopJson | undefined> {
        if (this.stopped || !mactopAvailable()) return Promise.resolve(undefined)
        return new Promise((resolve) => {
            const child = spawn("mactop", ["--headless", "--format", "json", "--count", "1"], {
                stdio: ["ignore", "pipe", "ignore"],
            })
            this.seedChild = child
            track(child)
            let output = ""
            const finish = (value: MactopJson | undefined) => {
                if (this.seedChild === child) this.seedChild = undefined
                child.kill()
                resolve(value)
            }
            // An unhandled stream 'error' event would throw in the host process.
            child.stdout?.on("error", () => {})
            const timer = setTimeout(() => finish(undefined), 6000)
            child.stdout?.on("data", (chunk: Buffer) => {
                output += chunk.toString("utf8")
            })
            child.on("error", () => {
                clearTimeout(timer)
                finish(undefined)
            })
            child.on("close", () => {
                clearTimeout(timer)
                try {
                    const parsed = JSON.parse(output) as MactopJson | MactopJson[]
                    finish(Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed)
                } catch {
                    finish(undefined)
                }
            })
        })
    }

    stop(): void {
        this.stopped = true
        const child = this.child
        this.child = undefined
        if (child) {
            debug("stopping mactop", child.pid)
            child.stdout?.destroy()
            child.kill()
        } else {
            debug("stop called with no tracked child")
        }
        const seed = this.seedChild
        this.seedChild = undefined
        if (seed) {
            seed.stdout?.destroy()
            seed.kill()
        }
    }

    private url(port = this.port) {
        return `http://127.0.0.1:${port}/metrics`
    }

    private async scrape(port = this.port): Promise<Metrics | undefined> {
        try {
            const response = await fetch(this.url(port), {
                signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
            })
            if (!response.ok) return undefined
            const metrics = parseMetrics(await response.text())
            // A foreign service on the port would parse fine but carry no marker.
            return metrics.has("mactop_cpu_usage_percent") ? metrics : undefined
        } catch {
            return undefined
        }
    }

    private probe(port: number): Promise<boolean> {
        return this.scrape(port).then(
            (metrics) => metrics !== undefined,
            () => false,
        )
    }

    private async launch(): Promise<boolean> {
        if (this.launching) {
            await this.launching
            return this.child !== undefined
        }
        this.launching = this.launchOnce().finally(() => {
            this.launching = undefined
        })
        await this.launching
        return this.child !== undefined
    }

    private async launchOnce(): Promise<void> {
        if (this.child || this.stopped) return
        if (!mactopAvailable()) {
            this.missing = true
            return
        }
        const base = this.port
        let fallback: number | undefined
        for (let candidate = base; candidate <= Math.min(base + 4, 65535); candidate++) {
            if (await this.probe(candidate)) {
                // Someone else's mactop (menubar/overlay instance) owns this
                // port: it serves /metrics but not our JSON stream. Give a
                // just-disposed previous generation a moment to exit before
                // moving on, then keep the port as a metrics-only last resort.
                await sleep(500)
                if (!(await this.probe(candidate))) {
                    // free again — fall through and spawn here
                } else {
                    fallback ??= candidate
                    continue
                }
            }
            // A new generation gets a clean scanner: a torn object left by a
            // killed child would otherwise unbalance the brace counter forever.
            const generation = ++this.generation
            this.stream = new JsonStream()
            this.latest = undefined
            this.latestAt = 0
            const startedAt = Date.now()
            const child = spawn(
                "mactop",
                ["-p", `:${candidate}`, "--headless", "--format", "json", "--interval", String(this.intervalMs)],
                // stdout is the sample stream; stderr is only diagnostics. Never
                // leave stdout unread: mactop writes a JSON blob per interval.
                { stdio: ["ignore", "pipe", "ignore"] },
            )
            track(child)
            let spawnError: Error | undefined
            child.on("error", (error) => {
                spawnError = error
            })
            child.on("exit", () => {
                if (this.child === child) this.child = undefined
            })
            this.attachStream(child, generation)
            const ready = await this.waitForReady(candidate, () => spawnError, startedAt)
            if (!ready) {
                debug("mactop not ready on port", candidate, spawnError?.message)
                child.kill()
                this.child = undefined
                continue
            }
            this.child = child
            this.port = candidate
            this.failure = undefined
            debug("mactop ready", { pid: child.pid, port: candidate })
            return
        }
        if (fallback !== undefined) {
            this.port = fallback
            this.failure = undefined
            debug("using an existing mactop on port", fallback, "(metrics only)")
            return
        }
        this.failure = "mactop failed to start"
    }

    private attachStream(child: ChildProcess, generation: number) {
        child.stdout?.setEncoding("utf8")
        child.stdout?.on("error", () => {})
        child.stdout?.on("data", (chunk: string) => {
            if (generation !== this.generation) return
            for (const parsed of this.stream.push(chunk)) {
                this.latest = parsed as MactopJson
                this.latestAt = Date.now()
            }
        })
    }

    private async waitForReady(port: number, spawnError: () => Error | undefined, startedAt: number): Promise<boolean> {
        const deadline = Date.now() + READY_TIMEOUT_MS
        while (Date.now() < deadline) {
            if (this.stopped) return false
            const error = spawnError()
            if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                this.missing = true
                return false
            }
            // Only data written after this spawn counts as readiness: a stale
            // object from a previous generation would mark a dead child ready.
            if (this.latest && this.latestAt >= startedAt) return true
            // A pre-existing mactop on this port has no stream of ours; accept
            // the endpoint so the fallback still has data.
            if (await this.probe(port)) return true
            await sleep(120)
        }
        return false
    }
}
