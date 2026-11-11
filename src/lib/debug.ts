import { appendFile, existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const LOG = join(tmpdir(), "system-stats-heartbeat.log")
const ROTATE_AT = 1_000_000
const RECHECK_MS = 30_000

let checkedAt = 0
let enabled = false
let written = 0

/** Directory holding `tui.js` and `config.json` (works from src/lib too). */
export function pluginRoot(): string {
    const here = dirname(fileURLToPath(import.meta.url))
    return existsSync(join(here, "config.json")) ? here : dirname(dirname(here))
}

function tracing(): boolean {
    const now = Date.now()
    if (now - checkedAt >= RECHECK_MS) {
        checkedAt = now
        enabled = existsSync(join(pluginRoot(), "debug.flag"))
    }
    return enabled
}

/**
 * Opt-in tracing. The flag is cached (a syscall per sample on the render thread
 * is wasteful), writes are asynchronous and the file is truncated past ~1 MB.
 */
export function trace(message: string): void {
    if (!tracing()) return
    const line = `${new Date().toISOString()} ${message}\n`
    try {
        written += line.length
        if (written > ROTATE_AT) {
            written = 0
            writeFileSync(LOG, "")
        }
        appendFile(LOG, line, () => {})
    } catch {
        // tracing must never affect the panel
    }
}
