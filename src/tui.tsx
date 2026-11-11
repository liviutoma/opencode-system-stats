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
export default {
    id: "local.system-stats",
    setup(ctx: Plugin.Context) {
        const config = loadConfig(ctx.options)
        const sampler = createSampler(config)
        ctx.ui.slot({
            append: "sidebar.content",
            render: () => <StatsBoard theme={ctx.theme} sampler={sampler} config={config} />,
        })
        return () => sampler.dispose()
    },
}
