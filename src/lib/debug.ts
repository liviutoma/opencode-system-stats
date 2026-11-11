import { appendFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Opt-in tracing: create `debug.flag` next to the plugin and every call lands in
 * /tmp/system-stats-heartbeat.log. Never throws — tracing must not affect the
 * panel.
 */
export function pluginRoot(): string {
    const here = dirname(fileURLToPath(import.meta.url))
    return existsSync(join(here, "config.json")) ? here : dirname(dirname(here))
}

export function trace(message: string): void {
    try {
        if (!existsSync(join(pluginRoot(), "debug.flag"))) return
        appendFileSync("/tmp/system-stats-heartbeat.log", `${new Date().toISOString()} ${message}\n`)
    } catch {
        // ignore
    }
}
