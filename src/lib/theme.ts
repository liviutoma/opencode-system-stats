/**
 * Theme shape adapter.
 *
 * The plugin API types in 2.0.x expose `theme.text.default/subdued` (and
 * `action.primary.default`), while newer hosts pass `text.base/muted`
 * (`action.primary.base`). Both are live in the wild — the host in this
 * workspace is newer than the published plugin types — so resolve at runtime
 * instead of pinning to one shape.
 */

import type { ResolvedTheme } from "@opencode/theme/tui"

type Color = ResolvedTheme["text"]["default"]

type Themeish = {
    readonly text: {
        readonly base?: Color
        readonly muted?: Color
        readonly default?: Color
        readonly subdued?: Color
        readonly action?: Readonly<Record<string, Readonly<Record<string, Color>> | undefined>>
        readonly feedback?: Readonly<Record<string, Readonly<Record<string, Color>> | undefined>>
    }
}

export type Palette = {
    readonly text: Color
    readonly muted: Color
    readonly primary: Color
    readonly success: Color
    readonly warning: Color
    readonly error: Color
}

function feedback(theme: Themeish, kind: string): Color | undefined {
    const entry = theme.text.feedback?.[kind]
    return entry?.base ?? entry?.default
}

export function palette(theme: ResolvedTheme): Palette {
    const resolved = theme as unknown as Themeish
    const text = resolved.text.default ?? resolved.text.base!
    return {
        text,
        muted: resolved.text.subdued ?? resolved.text.muted ?? text,
        primary: resolved.text.action?.primary?.base ?? resolved.text.action?.primary?.default ?? text,
        success: feedback(resolved, "success") ?? text,
        warning: feedback(resolved, "warning") ?? text,
        error: feedback(resolved, "error") ?? text,
    }
}
