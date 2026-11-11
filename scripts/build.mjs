// Build: preset-solid compile first (reactive getters in props), then bundle.
// esbuild's own JSX runtime emits plain values for props like `when={ready()}`,
// which freezes forever after the first render.
import { transformFileSync } from "@babel/core"
import babelSolid from "babel-preset-solid"
import babelTypescript from "@babel/preset-typescript"
import { build } from "esbuild"
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const walk = (directory) =>
    readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry)
        return statSync(path).isDirectory() ? walk(path) : [path]
    })

rmSync(".build", { recursive: true, force: true })
for (const file of walk("src").filter((path) => /\.[cm]?tsx?$/.test(path))) {
    const result = transformFileSync(file, {
        configFile: false,
        babelrc: false,
        filename: file,
        presets: [
            [babelSolid, { moduleName: "@opentui/solid", generate: "universal" }],
            babelTypescript,
        ],
    })
    const target = join(".build", file.slice("src/".length).replace(/\.[cm]?tsx?$/, ".js"))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, result.code)
}

await build({
    entryPoints: [".build/tui.js"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: "tui.js",
    external: ["solid-js", "solid-js/*", "@opentui/solid", "@opentui/solid/*"],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
})
