/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import fs from "node:fs";
import { resolve } from "node:path";
import { bundle } from "./bundle.js";

// The embed and shell (kicanvas.js), and the board viewer on its own for
// pages that bring their own UI (kicanvas-board.js, src/board-view).
const builds = [
    { outfile: "build/kicanvas.js", metafile: "build/esbuild-meta.json" },
    {
        entryPoints: [resolve("src/board-view/index.ts")],
        outfile: "build/kicanvas-board.js",
        metafile: "build/esbuild-meta-board.json",
    },
];

for (const { metafile, ...target } of builds) {
    let { options, context } = await bundle({
        ...target,
        minify: true,
        metafile: true,
    });

    console.log(`Building to ${options.outfile}`);
    let result = await context.rebuild();

    console.log(`Build complete!`);
    console.log(`${result.warnings.length} warnings`);
    for (const msg of result.warnings) {
        console.log("- ", msg);
    }
    console.log(`${result.errors.length} errors`);
    for (const msg of result.errors) {
        console.log("- ", msg);
    }

    console.log(`Saving metafile to ${metafile}`);
    fs.writeFileSync(metafile, JSON.stringify(result.metafile));

    context.dispose();
}
