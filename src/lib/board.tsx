/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo, onCleanup } from "solid-js"
import type { ResolvedTheme } from "@opencode/theme/tui"
import type { Config, Row } from "./config"
import type { Sampler, Sample } from "./sampler"
import { bar, bytes, gigahertz, gigabytes, percent, rate, sparkline, temperature, watts } from "./format"
import { palette, type Palette } from "./theme"
import { trace } from "./debug"

type Tone = "text" | "muted" | "warn" | "error" | "ok" | "accent"

type Line = {
    readonly label: string
    readonly spark: string
    readonly value: string
    readonly tone: Tone
    readonly sparkTone: Tone
}

const LABELS: Record<Row, string> = {
    cpu: "CPU",
    cputemp: "CPUTMP",
    mem: "MEM",
    temp: "SOC",
    gpu: "GPU",
    gputemp: "GPUTMP",
    pwr: "PWR",
    net: "NET",
    disk: "DISK",
}

function color(colors: Palette, name: Tone) {
    switch (name) {
        case "muted":
            return colors.muted
        case "warn":
            return colors.warning
        case "error":
            return colors.error
        case "ok":
            return colors.success
        case "accent":
            return colors.primary
        default:
            return colors.text
    }
}

function heat(value: number | undefined, warn: number, critical: number): Tone {
    if (value === undefined) return "muted"
    if (value >= critical) return "error"
    if (value >= warn) return "warn"
    return "text"
}

function line(row: Row, sample: Sample | undefined, config: Config, sampler: Sampler): Line {
    const width = config.sparkWidth
    switch (row) {
        case "cpu": {
            const value = sample?.cpu
            return {
                label: LABELS.cpu,
                spark: sparkline(sampler.history("cpu"), width, { max: 25 }),
                value: percent(value),
                tone: heat(value, 70, 90),
                sparkTone: "accent",
            }
        }
        case "cputemp": {
            const value = sample?.cpuTemp
            return {
                label: LABELS.cputemp,
                spark: sparkline(sampler.history("cputemp"), width, { min: 30, max: 100 }),
                value: temperature(value),
                tone: heat(value, 80, 95),
                sparkTone: heat(value, 80, 95),
            }
        }
        case "mem": {
            const value = sample?.memPct
            return {
                label: LABELS.mem,
                spark: sparkline(sampler.history("mem"), width, { max: 100 }),
                value: `${percent(value)} ${gigabytes(sample?.memUsed)}/${gigabytes(sample?.memTotal)}`,
                tone: heat(value, 80, 92),
                sparkTone: "ok",
            }
        }
        case "pwr": {
            const value = sample?.power
            return {
                label: LABELS.pwr,
                spark: sparkline(sampler.history("pwr"), width),
                value: watts(value),
                tone: heat(value, 45, 75),
                sparkTone: "warn",
            }
        }
        case "temp": {
            const value = sample?.temp
            return {
                label: LABELS.temp,
                spark: sparkline(sampler.history("temp"), width, { min: 30, max: 95 }),
                value: temperature(value),
                tone: heat(value, 75, 90),
                sparkTone: heat(value, 75, 90),
            }
        }
        case "gpu": {
            const value = sample?.gpu
            return {
                label: LABELS.gpu,
                spark: sparkline(sampler.history("gpu"), width, { max: 25 }),
                value: percent(value),
                tone: heat(value, 85, 97),
                sparkTone: "accent",
            }
        }
        case "gputemp": {
            const value = sample?.gpuTemp
            return {
                label: LABELS.gputemp,
                spark: sparkline(sampler.history("gputemp"), width, { min: 30, max: 100 }),
                value: temperature(value),
                tone: heat(value, 85, 98),
                sparkTone: heat(value, 85, 98),
            }
        }
        case "net": {
            return {
                label: LABELS.net,
                spark: sparkline(sampler.history("netIn"), width, { max: 2 * 1024 * 1024 }),
                value: `↓${rate(sample?.netIn)} ↑${rate(sample?.netOut)}`,
                tone: "text",
                sparkTone: "accent",
            }
        }
        case "disk": {
            const used = sample?.diskUsedPct
            return {
                label: LABELS.disk,
                spark: bar(used, width),
                value: `${percent(used)} ${bytes(sample?.diskUsed)}/${bytes(sample?.diskTotal)}`,
                tone: heat(used, 85, 95),
                sparkTone: heat(used, 85, 95),
            }
        }
    }
}

function clock(label: string, current: number | undefined, peak: number): string {
    if (current === undefined) return `${label} —`
    if (!peak || peak <= 0) return `${label} ${gigahertz(current)}G`
    return `${label} ${gigahertz(current)}/${gigahertz(peak)}G`
}

/**
 * One row. The element tree is created once and only its text content is
 * rebound — recreating rows per tick (new `For` items) left the sidebar's
 * scrollbox showing stale frames, while stable elements update fine.
 */
function Row(props: { row: Row; theme: ResolvedTheme; sampler: Sampler; config: Config }) {
    const colors = () => palette(props.theme)
    const data = createMemo(() => {
        props.sampler.tick()
        return line(props.row, props.sampler.current(), props.config, props.sampler)
    })
    return (
        <box flexDirection="row" gap={1}>
            <text fg={colors().muted}>{LABELS[props.row].padEnd(6)}</text>
            <text fg={color(colors(), data().sparkTone)}>{data().spark}</text>
            <text fg={color(colors(), data().tone)}>{data().value}</text>
        </box>
    )
}

export function StatsBoard(props: { theme: ResolvedTheme; sampler: Sampler; config: Config }) {
    const unsubscribe = props.sampler.subscribe()
    onCleanup(unsubscribe)
    trace(`panel-mount id=${props.sampler.id}`)
    let lastReady: boolean | undefined
    onCleanup(() => trace(`panel-unmount id=${props.sampler.id}`))

    const colors = () => palette(props.theme)
    const ready = () => {
        props.sampler.tick()
        const has = props.sampler.current() !== undefined
        if (has !== lastReady) {
            lastReady = has
            trace(`panel-ready id=${props.sampler.id} has=${has}`)
        }
        return has
    }
    const chip = () => {
        props.sampler.tick()
        const system = props.sampler.current()?.system
        if (!system?.model) return "System"
        const parts: string[] = [system.model]
        if (system.cores) {
            const split = system.pCores && system.sCores ? ` (${system.pCores}P+${system.sCores}S)` : ""
            parts.push(`${system.cores}c${split}`)
        }
        if (system.gpuCores) parts.push(`${system.gpuCores}g`)
        return parts.join(" · ")
    }
    const clocks = () => {
        props.sampler.tick()
        const current = props.sampler.current()
        const peaks = props.sampler.peaks()
        return [
            clock("P", current?.freqP, peaks.p),
            clock("S", current?.freqS, peaks.s),
            clock("G", current?.freqG, peaks.g),
        ].join(" ")
    }
    const error = () => {
        props.sampler.tick()
        return props.sampler.current()?.error
    }

    return (
        <box flexDirection="column" gap={0}>
            <text fg={colors().primary}>
                <b>{chip()}</b>
            </text>
            <text fg={colors().muted}>{clocks()}</text>
            <Show when={ready()} fallback={<text fg={colors().muted}>measuring…</text>}>
                <For each={props.config.rows}>
                    {(row) => <Row row={row} theme={props.theme} sampler={props.sampler} config={props.config} />}
                </For>
                <Show when={error()}>{(message) => <text fg={colors().warning}>{message()}</text>}</Show>
            </Show>
        </box>
    )
}
