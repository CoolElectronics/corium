import { parseSrcset, type SrcSetDefinition, stringifySrcset } from "srcset";
import { localizeResource, request } from "../request";
import { sBlobUrls, sIframeSrc, sLocation, type Win } from "../win";
import { rewriteStyle, simulateStyle, simulateStyleLink } from "./css";


async function rewriteSrcset(srcset: string, win: Win) {
    const parsed = parseSrcset(srcset);
    const newSrcset: SrcSetDefinition[] = [];

    for (const src of parsed)
        newSrcset.push({
            url: await localizeResource(
                new URL(src.url, win[sLocation]),
                "image",
                win
            ),
            ...(src.density ? { density: src.density } : {}),
            ...(src.width ? { width: src.width } : {}),
        });

    return stringifySrcset(newSrcset);
}

function rewriteSVG(svg: SVGSVGElement, win: Win) {
    for (const image of svg.querySelectorAll("image")) {
        const href = image.getAttribute("xlink:href");
        if (href) {
            image.removeAttribute("xlink:href");
            localizeResource(new URL(href, win[sLocation]), "image", win).then(
                (url) => image.setAttribute("xlink:href", url)
            );
        }
    }
}

export default async function rewriteElement(node: Element, win: Win, pushScript: Function, anchorClick: Function) {
    switch (node.tagName.toUpperCase()) {
        case "NOSCRIPT": {
            const fragment = new DocumentFragment();
            for (const child of node.children) fragment.append(child);
            node.replaceWith(fragment);
        } break;
        case "SCRIPT": {
            const script = node as HTMLScriptElement;

            if (script.src) {
                const { src } = script;
                const ssrc = await request(new Request(src), "script", win);
                await pushScript(script, await ssrc.text(), src.substring(0, src.lastIndexOf("/")));
            }
            if (script.innerHTML.length > 0) {
                await pushScript(script, script.innerHTML, win[sLocation].toString());
            }
        } break;
        case "META": {
            const meta = node as HTMLMetaElement;
            if (!["encoding", "content-type"].includes(meta.httpEquiv)) meta.remove();
        } break;
        case "LINK": {
            const link = node as HTMLLinkElement;
            switch (link.rel) {
                case "stylesheet": {
                    link.replaceWith(await simulateStyleLink(link, win));
                    break;
                }
                case "preload": {
                    link.remove();
                    break;
                }
            }
        } break;
        case "STYLE": {
            node.replaceWith(await simulateStyle(node.textContent || "", win));
        } break;
        case "IFRAME": {
            const frame = node as HTMLIFrameElement;
            frame[sIframeSrc] = frame.src;
            frame.src = "";
            frame.removeAttribute("sandbox");
            frame.removeAttribute("allow");
        } break;
        case "A": {
            const anchor = node as HTMLAnchorElement;
            if (anchor.ping) anchor.ping = "";

            anchor.addEventListener(
                "click",
                (event) => anchorClick(event, anchor),
                {
                    // preventDefault stops middle clicking when capture is set to false
                    capture: false,
                }
            );
        } break;
        case "IMG": {
            const img = node as HTMLImageElement;
            if (img.src) {
                const { src } = img;
                img.src = "";
                // asynchronously load images
                localizeResource(src, "image", win).then((url) => (img.src = url));
            }
        } break;
        case "VIDEO": {
            const video = node as HTMLVideoElement;
            if (video.poster) {
                const { poster } = video;
                localizeResource(poster, "image", win).then(
                    (url) => (video.poster = url)
                );
                video.poster = "";
            }
            // capture type & src before we detach the sources
            const sources = [...video.querySelectorAll("source")].map((source) => ({
                type: source.type,
                src: source.src,
            }));

            for (const track of video.querySelectorAll("track"))
                if (track.src) {
                    const { src } = track;
                    track.src = "";
                    // asynchronously load track
                    localizeResource(src, "track", win).then((url) => (track.src = url));
                }

            for (const source of video.querySelectorAll("source")) source.remove();

            const source = sources.find((source) =>
                MediaSource.isTypeSupported(source.type)
            );

            if (!source) break;

            request(new Request(source.src), "video", win).then(async (res) => {
                const blobUrl = URL.createObjectURL(await res.blob());
                video.src = blobUrl;
                win[sBlobUrls].push(blobUrl);
            });
        } break;
        case "SVG": {
            const svg = node as SVGSVGElement;
            rewriteSVG(svg, win);
        } break;
    }

    if (node instanceof HTMLImageElement || node instanceof HTMLSourceElement) {
        if (node.srcset) {
            const { srcset } = node;
            node.srcset = "";
            rewriteSrcset(srcset, win).then((srcset) => (node.srcset = srcset));
        }
    }



    //   for (const form of protoDom.querySelectorAll("form"))
    //     form.addEventListener("submit", (event) => {
    //       event.preventDefault();
    //       const query = new URLSearchParams();

    //       for (let i = 0; i < form.elements.length; i++) {
    //         const node = form.elements[i] as HTMLInputElement;
    //         query.set(node.name, node.value);
    //       }

    //       let req: Request;

    //       if (form.method === "post") {
    //         req = new Request(form.action, {
    //           method: "POST",
    //           body: query,
    //         });
    //       } else {
    //         const url = new URL(form.action);
    //         url.search = `?${query}`;

    //         req = new Request(url);
    //       }

    //       openWindow(req, "_self", win, client);
    //     });

    if (node instanceof HTMLElement) {
        const elm = node as HTMLElement;
        if (elm.style) {
            await rewriteStyle(node.style, win);
        }
    }
}