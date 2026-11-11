/**
 * One sampler per plugin process, shared by every sidebar mount.
 *
 * Primary input is mactop's JSON stream (CPU/GPU clocks, package power,
 * per-group temperatures, volume usage); `/metrics` and the `os` module are
 * fallbacks so the panel degrades to fewer rows instead of going blank.
 */

import { statfsSync } from "node:fs"
import { trace } from "./debug"
import { cpus, freemem, totalmem } from "node:os"
import { createSignal } from "solid-js"
import { MactopSource, type MactopJson } from "./mactop"
import { metric, type Metrics } from "./prom"
import type { Config } from "./config"

export type SystemInfo = {
    readonly model?: string
    readonly cores?: number
    readonly pCores?: number
    readonly sCores?: number
    readonly gpuCores?: number
}

export type Sample = {
    readonly at: number
    readonly cpu?: number
    readonly cpuTemp?: number
    readonly memPct?: number
    readonly memUsed?: number
    readonly memTotal?: number
    readonly pressure?: number
    readonly temp?: number
    readonly gpu?: number
    readonly gpuTemp?: number
    readonly power?: number
    readonly netIn?: number
    readonly netOut?: number
    readonly freqP?: number
    readonly freqS?: number
    readonly freqG?: number
    readonly diskUsedPct?: number
    readonly diskUsed?: number
    readonly diskTotal?: number
    readonly system?: SystemInfo
    readonly error?: string
}

export type HistoryKey =
    | "cpu"
    | "cputemp"
    | "mem"
    | "temp"
    | "gpu"
    | "gputemp"
    | "pwr"
    | "netIn"
    | "netOut"
    | "disk"

export type Peaks = { p: number; s: number; g: number }

type CpuTimes = { idle: number; total: number }

export type Sampler = ReturnType<typeof createSampler>

const GIGABYTE = 1024 ** 3
const KILOBYTE = 1024

const positive = (value: number | undefined) => (value !== undefined && value > 0 ? value : undefined)

export function createSampler(config: Config, onSample?: () => void) {
    // Distinguishes sampler instances in traces: several can exist if setup()
    // runs more than once or a hot reload leaves an old claim behind.
    const id = Math.random().toString(36).slice(2, 8)
    const [tick, setTick] = createSignal(0)
    const history = new Map<HistoryKey, number[]>()
    const peaks: Peaks = { p: 0, s: 0, g: 0 }
    // mactop buffers its JSON stream until ~64 KB, so a 1 s sampling interval keeps
    // chip info and CPU clocks arriving every few seconds instead of every ~10 s.
    const source = new MactopSource(config.port, Math.min(config.intervalMs, 1000))
    let system: SystemInfo | undefined
    let current: Sample | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let subscribers = 0
    let sampling = false
    let previousCpu: CpuTimes | undefined
    let seed: MactopJson | undefined
    let seedTimer: ReturnType<typeof setInterval> | undefined
    let disposed = false

    const record = (key: HistoryKey, value: number | undefined) => {
        if (value === undefined || !Number.isFinite(value)) return
        const series = history.get(key) ?? []
        series.push(value)
        if (series.length > config.history) series.splice(0, series.length - config.history)
        history.set(key, series)
    }

    const cpuUsage = (): number | undefined => {
        const totals = cpus().reduce<CpuTimes>(
            (result, cpu) => {
                const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
                return { idle: result.idle + cpu.times.idle, total: result.total + total }
            },
            { idle: 0, total: 0 },
        )
        const previous = previousCpu
        previousCpu = totals
        if (!previous) return undefined
        const idle = totals.idle - previous.idle
        const total = totals.total - previous.total
        if (total <= 0) return undefined
        return Math.max(0, Math.min(100, 100 * (1 - idle / total)))
    }

    const diskFallback = (): Pick<Sample, "diskUsedPct" | "diskUsed" | "diskTotal" | "netIn" | "netOut"> => {
        const result: { diskUsedPct?: number; diskUsed?: number; diskTotal?: number } = {}
        try {
            const stats = statfsSync(config.diskPath)
            const total = stats.blocks * stats.bsize
            const free = stats.bavail * stats.bsize
            const used = Math.max(0, total - stats.bfree * stats.bsize)
            result.diskUsedPct = total > 0 ? (used / total) * 100 : undefined
            result.diskUsed = used
            result.diskTotal = total
        } catch {
            // keep the row blank rather than failing the whole sample
        }
        return result
    }

    const bootVolume = (data: MactopJson) => {
        const volumes = data.volumes ?? []
        if (volumes.length === 0) return undefined
        return volumes.reduce((best, volume) =>
            (volume.total_gb ?? 0) > (best.total_gb ?? 0) ? volume : best,
        )
    }

    const temperatureGroup = (data: MactopJson, pattern: RegExp): number | undefined => {
        const groups = data.temperatures ?? []
        const match = groups.find((group) => group.group !== undefined && pattern.test(group.group))
        return positive(match?.avg_celsius) ?? positive(match?.max_celsius)
    }

    const trackPeaks = (data: MactopJson): Pick<Sample, "freqP" | "freqS" | "freqG"> => {
        const metrics = data.soc_metrics
        const freqP = positive(metrics?.p_cluster_freq_mhz)
        const freqS = positive(metrics?.s_cluster_freq_mhz)
        const freqG = positive(metrics?.gpu_freq_mhz)
        // The DVFS ceiling is not exposed by macOS; the highest clock observed
        // in this session is the best available "max" and converges under load.
        if (freqP && freqP > peaks.p) peaks.p = freqP
        if (freqS && freqS > peaks.s) peaks.s = freqS
        if (freqG && freqG > peaks.g) peaks.g = freqG
        return { freqP, freqS, freqG }
    }

    const remember = (data: MactopJson): SystemInfo | undefined => {
        const info = data.system_info
        if (info?.name) {
            system = {
                model: info.name,
                cores: info.core_count,
                pCores: info.p_core_count,
                sCores: info.s_core_count,
                gpuCores: info.gpu_core_count,
            }
        }
        return system
    }

    const fromJson = (data: MactopJson): Sample => {
        const memory = data.memory
        const net = data.net_disk
        const soc = data.soc_metrics
        const volume = bootVolume(data)
        const disk: Pick<Sample, "diskUsedPct" | "diskUsed" | "diskTotal"> =
            volume && volume.total_gb
                ? {
                      diskUsedPct: volume.used_percent,
                      diskUsed: (volume.used_gb ?? 0) * 1e9,
                      diskTotal: volume.total_gb * 1e9,
                  }
                : diskFallback()
        const memTotal = positive(memory?.total)
        const memUsed = positive(memory?.used)
        return {
            at: Date.now(),
            cpu: data.cpu_usage,
            cpuTemp: temperatureGroup(data, /cpu die|p-core|s-core/i) ?? positive(soc?.cpu_temp),
            memUsed: memUsed === undefined ? undefined : memUsed / GIGABYTE,
            memTotal: memTotal === undefined ? undefined : memTotal / GIGABYTE,
            memPct: memTotal && memUsed ? (memUsed / memTotal) * 100 : undefined,
            pressure: memory?.pressure_approx,
            temp: positive(soc?.soc_temp),
            gpu: data.gpu_usage,
            gpuTemp: temperatureGroup(data, /gpu/i) ?? positive(soc?.gpu_temp),
            power: positive(soc?.total_power),
            netIn: net?.in_bytes_per_sec,
            netOut: net?.out_bytes_per_sec,
            ...trackPeaks(data),
            ...disk,
            system: remember(data),
        }
    }

    const fromMetrics = (metrics: Metrics, json: MactopJson | undefined): Sample => {
        const memTotal = metric(metrics, "mactop_memory_gb", { type: "total" })
        const memUsed = metric(metrics, "mactop_memory_gb", { type: "used" })
        const socTemp = positive(metric(metrics, "mactop_soc_temp_celsius"))
        const netIn = metric(metrics, "mactop_network_kbytes_per_sec", { direction: "download" })
        const netOut = metric(metrics, "mactop_network_kbytes_per_sec", { direction: "upload" })
        const extras = json ?? seed
        const volume = extras ? bootVolume(extras) : undefined
        return {
            at: Date.now(),
            cpu: positive(metric(metrics, "mactop_cpu_usage_percent")) ?? 0,
            cpuTemp:
                positive(metric(metrics, "mactop_temp_sensor_celsius", { key: "TCDX" })) ??
                positive(metric(metrics, "mactop_temp_sensor_celsius", { key: "TCHP" })) ??
                socTemp,
            memUsed: positive(memUsed),
            memTotal: positive(memTotal),
            memPct: memTotal && memUsed && memTotal > 0 ? (memUsed / memTotal) * 100 : undefined,
            pressure: positive(metric(metrics, "mactop_memory_pressure_approx")),
            temp: socTemp,
            gpu: positive(metric(metrics, "mactop_gpu_usage_percent")) ?? 0,
            gpuTemp: positive(metric(metrics, "mactop_gpu_temp_celsius")),
            power: positive(metric(metrics, "mactop_power_watts", { component: "total" })),
            netIn: netIn === undefined ? undefined : netIn * KILOBYTE,
            netOut: netOut === undefined ? undefined : netOut * KILOBYTE,
            // Clocks and chip identity only exist in the JSON stream, which
            // flushes in bursts — merge the newest object when we have it.
            ...(extras ? trackPeaks(extras) : { freqG: positive(metric(metrics, "mactop_gpu_freq_mhz")) }),
            ...(volume && volume.total_gb
                ? {
                      diskUsedPct: volume.used_percent,
                      diskUsed: (volume.used_gb ?? 0) * 1e9,
                      diskTotal: volume.total_gb * 1e9,
                  }
                : diskFallback()),
            system: extras ? remember(extras) : system,
        }
    }

    const fromOs = (error: string | undefined): Sample => {
        const total = totalmem()
        const free = freemem()
        return {
            at: Date.now(),
            cpu: cpuUsage(),
            memTotal: total / GIGABYTE,
            memUsed: (total - free) / GIGABYTE,
            memPct: total > 0 ? ((total - free) / total) * 100 : undefined,
            ...diskFallback(),
            system,
            error,
        }
    }

    const commit = (sample: Sample) => {
        current = sample
        record("cpu", sample.cpu)
        record("cputemp", sample.cpuTemp)
        record("mem", sample.memPct)
        record("temp", sample.temp)
        record("gpu", sample.gpu)
        record("gputemp", sample.gpuTemp)
        record("pwr", sample.power)
        record("netIn", sample.netIn)
        record("netOut", sample.netOut)
        record("disk", sample.diskUsedPct)
        setTick((value) => value + 1)
        // Solid has already flushed the bound text by now; opentui still needs
        // an explicit repaint request or a timer-driven update stays invisible
        // until some input (session switch, keystroke) redraws the screen.
        trace(
            `id=${id} pid=${process.pid} subs=${subscribers} cpu=${sample.cpu?.toFixed(1)} mem=${sample.memPct?.toFixed(1)} temp=${sample.cpuTemp?.toFixed(1)} pwr=${sample.power?.toFixed(1)} err=${sample.error ?? "-"}`,
        )
        onSample?.()
    }

    const sampleOnce = async () => {
        if (sampling || disposed) return
        sampling = true
        try {
            trace(`id=${id} pid=${process.pid} sampling subs=${subscribers} port=${config.port}`)
            const snapshot = await source.sample()
            trace(`id=${id} snapshot=${snapshot ? Object.keys(snapshot).join("+") : "none"} sourceError=${source.error ?? "-"}`)
            if (!snapshot) {
                commit(fromOs(source.error))
                return
            }
            const sample = snapshot.metrics
                ? fromMetrics(snapshot.metrics, snapshot.json)
                : fromJson(snapshot.json!)
            // mactop serves readings before its first sampling tick (all zeros,
            // no memory) — keep "measuring…" instead of charting the warm-up.
            if (sample.memPct === undefined && sample.cpuTemp === undefined) return
            commit(sample)
        } finally {
            sampling = false
        }
    }

    const refreshSeed = () => {
        void source.seedJson().then((data) => {
            if (data) seed = data
        })
    }

    const start = () => {
        if (timer || disposed) return
        refreshSeed()
        seedTimer = setInterval(refreshSeed, 60_000)
        void sampleOnce()
        timer = setInterval(() => void sampleOnce(), config.intervalMs)
    }

    const stop = () => {
        if (timer) clearInterval(timer)
        if (seedTimer) clearInterval(seedTimer)
        timer = undefined
        seedTimer = undefined
    }

    const subscribe = () => {
        subscribers += 1
        start()
        let active = true
        return () => {
            if (!active) return
            active = false
            subscribers -= 1
            if (subscribers === 0) stop()
        }
    }

    return {
        id,
        tick,
        current: () => current,
        history: (key: HistoryKey) => history.get(key) ?? [],
        peaks: () => peaks,
        subscribe,
        dispose: () => {
            if (disposed) return
            disposed = true
            subscribers = 0
            stop()
            source.stop()
        },
    }
}
