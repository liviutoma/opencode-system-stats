/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { StatsBoard } from "./lib/board"
import { loadConfig } from "./lib/config"
import { createSampler } from "./lib/sampler"

/**
 * Local TUI plugin: live system metrics appended under the sidebar's context
 * block. One sampler per process; the sidebar only starts it while a session
 * view is mounted, and the mactop child dies with the plugin.
 */
// Hot reloads can leave the previous module instance without a clean shutdown;
// disposing here keeps timers and mactop children from accumulating.
let active: ReturnType<typeof createSampler> | undefined

export default {
    id: "local.system-stats",
    setup(ctx: Plugin.Context) {
        const config = loadConfig(ctx.options)
        active?.dispose()
        // Repaint explicitly: timer-driven updates otherwise stay invisible
        // until the next input event redraws the TUI.
        const sampler = createSampler(config, () => ctx.renderer.requestRender())
        active = sampler
        ctx.ui.slot({
            append: "sidebar.content",
            render: () => <StatsBoard theme={ctx.theme} sampler={sampler} config={config} />,
        })
        return () => {
            if (active === sampler) active = undefined
            sampler.dispose()
        }
    },
}
