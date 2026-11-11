/**
 * Config resolution: `ctx.options` (when the plugin is listed in config) wins
 * over `config.json` next to this plugin, which wins over the defaults.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type Row = "cpu" | "cputemp" | "mem" | "temp" | "gpu" | "gputemp" | "pwr" | "net" | "disk"

export type Config = {
    readonly port: number
    readonly intervalMs: number
    readonly diskPath: string
    readonly rows: Row[]
    readonly history: number
    readonly sparkWidth: number
}

const ROWS: Row[] = ["cpu", "cputemp", "mem", "temp", "gpu", "gputemp", "pwr", "net", "disk"]

const DEFAULTS: Config = {
    port: 9110,
    intervalMs: 2000,
    diskPath: "/",
    rows: ["cpu", "cputemp", "mem", "pwr", "gpu", "gputemp", "net", "disk"],
    history: 24,
    sparkWidth: 10,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function integer(value: unknown, fallback: number, min: number, max: number): number {
    const number = typeof value === "string" ? Number(value) : value
    return typeof number === "number" && Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback
}

function rows(value: unknown, fallback: Row[]): Row[] {
    if (!Array.isArray(value)) return fallback
    const selected = value.filter((row): row is Row => ROWS.includes(row as Row))
    return selected.length > 0 ? [...new Set(selected)] : fallback
}

function readFileConfig(): Record<string, unknown> {
    // `config.json` sits next to the built `tui.js`; during source-level
    // development the module lives one directory deeper (`src/lib/`).
    const here = dirname(fileURLToPath(import.meta.url))
    for (const directory of [here, dirname(here), dirname(dirname(here))]) {
        try {
            return JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as Record<string, unknown>
        } catch {
            continue
        }
    }
    return {}
}

export function loadConfig(options: Readonly<Record<string, unknown>> | undefined): Config {
    const merged = { ...readFileConfig(), ...(options ?? {}) }
    return {
        port: integer(merged.port, DEFAULTS.port, 1024, 65535),
        intervalMs: integer(merged.intervalMs, DEFAULTS.intervalMs, 500, 15000),
        diskPath: typeof merged.diskPath === "string" && merged.diskPath ? merged.diskPath : DEFAULTS.diskPath,
        rows: rows(merged.rows, DEFAULTS.rows),
        history: integer(merged.history, DEFAULTS.history, 8, 240),
        sparkWidth: integer(merged.sparkWidth, DEFAULTS.sparkWidth, 6, 16),
    }
}
