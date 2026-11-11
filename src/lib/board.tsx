/** @jsxImportSource @opentui/solid */
import { For, Show, onCleanup } from "solid-js"
import type { ResolvedTheme } from "@opencode/theme/tui"
import type { Config, Row } from "./config"
import type { Peaks, Sampler, Sample } from "./sampler"
import { bar, bytes, gigahertz, gigabytes, percent, rate, sparkline, temperature, watts } from "./format"
import { palette, type Palette } from "./theme"

type Tone = "text" | "muted" | "warn" | "error" | "ok" | "accent"

type Line = {
    readonly label: string
    readonly spark?: string
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

function build(key: Row, sample: Sample | undefined, config: Config, sampler: Sampler): Line {
    const width = config.sparkWidth
    switch (key) {
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
            const used = gigabytes(sample?.memUsed)
            const total = gigabytes(sample?.memTotal)
            return {
                label: LABELS.mem,
                spark: sparkline(sampler.history("mem"), width, { max: 100 }),
                value: `${percent(value)} ${used}/${total}`,
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

export function StatsBoard(props: { theme: ResolvedTheme; sampler: Sampler; config: Config }) {
    const unsubscribe = props.sampler.subscribe()
    onCleanup(unsubscribe)

    const colors = () => palette(props.theme)
    // Reading the tick signal inside an expression keeps the board reactive
    // without copying sampler state into component-local signals.
    const sample = (): Sample | undefined => {
        props.sampler.tick()
        return props.sampler.current()
    }
    const peaks = (): Peaks => {
        props.sampler.tick()
        return props.sampler.peaks()
    }
    const lines = (): Line[] => {
        props.sampler.tick()
        const current = props.sampler.current()
        return props.config.rows.map((key) => build(key, current, props.config, props.sampler))
    }
    const chip = () => {
        const system = sample()?.system
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
        const current = sample()
        const top = peaks()
        return [
            clock("P", current?.freqP, top.p),
            clock("S", current?.freqS, top.s),
            clock("G", current?.freqG, top.g),
        ].join(" ")
    }

    return (
        <box flexDirection="column" gap={0}>
            <text fg={colors().primary}>
                <b>{chip()}</b>
            </text>
            <text fg={colors().muted}>{clocks()}</text>
            <Show when={sample() !== undefined} fallback={<text fg={colors().muted}>measuring…</text>}>
                <For each={lines()}>
                    {(line) => (
                        <box flexDirection="row" gap={1}>
                            <text fg={colors().muted}>{line.label.padEnd(6)}</text>
                            <Show when={line.spark}>
                                {(spark) => <text fg={color(colors(), line.sparkTone)}>{spark()}</text>}
                            </Show>
                            <text fg={color(colors(), line.tone)}>{line.value}</text>
                        </box>
                    )}
                </For>
                <Show when={sample()?.error}>{(error) => <text fg={colors().warning}>{error()}</text>}</Show>
            </Show>
        </box>
    )
}
