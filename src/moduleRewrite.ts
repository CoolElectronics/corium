import { rollup } from "@rollup/browser";
import { request } from "./request";
import { sLocation, Win } from "./win";

// thank you https://github.com/samthor/html-modules-polyfill for proving this was possible

export default async function rewriteModule(source: string, relativePath: URL, win: Win): Promise<string> {

    console.log(relativePath);
    let pre = win[sLocation];
    win[sLocation] = relativePath;
    const protoDom = new win.DOMParser().parseFromString(
        "",
        "text/html"
    );

    // protoDom.location = relativePath.toString();
    const base = document.createElement("base");
    base.href = relativePath.toString();
    protoDom.head.append(base);
    win.document.head.append(base.cloneNode());

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
        async resolveId(importee) {
            // Don't actually resolve any importees, but mark imports as internal, given they are able to be pulled down.
            if (!(importee in virtualSourceMap))
                try {

                    console.log("got here: " + importee);

                    let virtualtag = protoDom.createElement("script");
                    virtualtag.src = importee;
                    console.log(virtualtag.src);
                    let req = await request(new Request(virtualtag.src), "script", win);
                    virtualtag.remove();

                    console.log("not here?");

                    virtualSourceMap[importee] = await req.text();
                    // console.log(virtualSourceMap[importee]);
                } catch (e) {
                    console.error(e);
                }

            return {
                id: importee,
                external: !(importee in virtualSourceMap),
            };
        },
        load(id: any) {
            console.log("trying to load " + id);
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
    //@ts-ignore

    window["f"] = out;
    const first = out.output[0];

    win[sLocation] = pre;
    return first.code;
}
//@ts-ignore
window["rw"] = rewriteModule;