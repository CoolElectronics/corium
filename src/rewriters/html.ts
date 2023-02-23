import { type Win } from "../win";
import { rewriteStyle, simulateStyle, simulateStyleLink } from "./css";

export default async function rewriteElement(node: Element, win: Win, pushScript: Function) {
    switch (node.tagName) {
        case "NOSCRIPT": {
            const fragment = new DocumentFragment();
            for (const child of node.children) fragment.append(child);
            node.replaceWith(fragment);
            break;
        }
        case "META": {
            if (!(node instanceof HTMLMetaElement)) break;
            if (!["encoding", "content-type"].includes(node.httpEquiv)) node.remove();
            break;
        }
        case "LINK": {
            if (!(node instanceof HTMLLinkElement)) break;
            switch (node.rel) {
                case "stylesheet": {
                    node.replaceWith(await simulateStyleLink(node, win));
                    break;
                }
                case "preload": {
                    node.remove();
                    break;
                }
            }
            break;
        }
        case "STYLE": {
            if (!(node instanceof HTMLStyleElement)) break;
            node.replaceWith(await simulateStyle(node.textContent || "", win));
            break;
        }
    }
    if (node instanceof HTMLElement) {
        const elm = node as HTMLElement;
        if (elm.style) {
            await rewriteStyle(node.style, win);
        }
    }
}