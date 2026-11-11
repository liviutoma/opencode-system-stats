/**
 * Formatting helpers for a 38-column sidebar. Everything must stay short: the
 * session sidebar is a fixed 42 columns with 2 columns of padding on each side.
 */

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

/** Right-aligned sparkline over the last `width` samples. */
export function sparkline(values: readonly number[], width: number, scale: { min?: number; max?: number } = {}): string {
    if (values.length === 0) return " ".repeat(width)
    const window = values.slice(-width)
    const min = scale.min ?? 0
    const max = Math.max(scale.max ?? Math.max(...window), min + 1e-9)
    const glyphs = window.map((value) => {
        const ratio = (value - min) / (max - min)
        const index = Math.max(0, Math.min(SPARK.length - 1, Math.round(ratio * (SPARK.length - 1))))
        return SPARK[index]!
    })
    return " ".repeat(Math.max(0, width - glyphs.length)) + glyphs.join("")
}

export function percent(value: number | undefined, digits = 0): string {
    if (value === undefined || !Number.isFinite(value)) return "—"
    return `${value.toFixed(digits)}%`
}

export function temperature(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return "—"
    return `${Math.round(value)}°C`
}

export function watts(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return "—"
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}W`
}

export function gigabytes(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return "—"
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)}G`
}

/** MHz → compact GHz ("4.6" for 4600, "0.34" for 340). */
export function gigahertz(megahertz: number | undefined): string {
    if (megahertz === undefined || !Number.isFinite(megahertz) || megahertz <= 0) return "—"
    const giga = megahertz / 1000
    return giga >= 1 ? giga.toFixed(1) : giga.toFixed(2)
}

/** Bytes per second → compact rate. */
export function rate(bytesPerSecond: number | undefined): string {
    if (bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond)) return "—"
    const value = Math.abs(bytesPerSecond)
    if (value < 1024) return `${Math.round(value)}B`
    const kilobytes = value / 1024
    if (kilobytes < 1024) return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)}K`
    const megabytes = kilobytes / 1024
    if (megabytes < 1024) return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)}M`
    return `${(megabytes / 1024).toFixed(1)}G`
}

export function bytes(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return "—"
    const units = ["B", "K", "M", "G", "T"]
    let scaled = value
    let unit = 0
    while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024
        unit += 1
    }
    return `${scaled >= 100 || unit === 0 ? Math.round(scaled) : scaled.toFixed(1)}${units[unit]}`
}

/** Horizontal bar for a 0-100 value. */
export function bar(value: number | undefined, width: number): string {
    const ratio = value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value)) / 100
    const filled = Math.round(ratio * width)
    return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled))
}
