/**
 * Minimal Prometheus text-exposition parser.
 *
 * mactop serves ~450 lines of `name{labels} value`; we only ever read single
 * numeric gauges, so a full parser (histograms, exemplars, escapes) would be
 * dead weight.
 */

export type Metrics = ReadonlyMap<string, number>

export function parseMetrics(text: string): Map<string, number> {
    const out = new Map<string, number>()
    for (const raw of text.split("\n")) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const split = line.lastIndexOf(" ")
        if (split <= 0) continue
        const key = line.slice(0, split).trim()
        const value = Number(line.slice(split + 1))
        if (!Number.isFinite(value)) continue
        out.set(key, value)
    }
    return out
}

/**
 * Reads a metric by name, optionally requiring label pairs. mactop emits labels
 * in a stable order, but matching on substrings keeps this resilient to both
 * ordering and extra labels.
 */
export function metric(
    metrics: Metrics | undefined,
    name: string,
    labels?: Readonly<Record<string, string>>,
): number | undefined {
    if (!metrics) return undefined
    const direct = metrics.get(name)
    if (direct !== undefined) {
        if (!labels || Object.keys(labels).length === 0) return direct
    }
    const prefix = `${name}{`
    for (const [key, value] of metrics) {
        if (!key.startsWith(prefix)) continue
        if (!labels) return value
        const matches = Object.entries(labels).every(([label, wanted]) =>
            key.includes(`${label}="${wanted}"`),
        )
        if (matches) return value
    }
    return undefined
}
