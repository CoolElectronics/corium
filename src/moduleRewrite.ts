import { rollup } from "@rollup/browser";
import type { Win } from "./win";

// thank you https://github.com/samthor/html-modules-polyfill for proving this was possible

export default async function rewriteModule(source: string, win: Win): Promise<string> {


    const virtualSourceMap: any = {};
    const pushVirtualSource = (source: any) => {
        const j = Object.keys(virtualSourceMap).length;
        const key = `\0virtual:${j}`;
        virtualSourceMap[key] = source;
        return key;
    };

    const entryImport = pushVirtualSource(source);

    const virtualPlugin = {
        name: "asdsd",
        // @ts-ignore
        resolveId(importee) {
            // Don't actually resolve any importees, but mark random imports as external.
            return {
                id: importee,
                external: !(importee in virtualSourceMap),
            };
        },
        load(id: any) {
            return virtualSourceMap[id];
        },
    };

    const bundle = await rollup({
        input: entryImport,
        plugins: [virtualPlugin],
    });

    const out = await bundle.generate({
        name: entryImport,
        format: 'es',
        sourcemap: true,
    });

    const first = out.output[0];
    return first.code;
}
//@ts-ignore
window["rw"] = rewriteModule;