import type BareClient from "@tomphttp/bare-client";
import type { SrcSetDefinition } from "srcset";
import { parseSrcset, stringifySrcset } from "srcset";
import parseRefreshHeader from "./parseRefresh";
import { localizeResource, request, validProtocols } from "./request";
import type { ContentHistory, Win } from "./win";
import {
  sTimeouts,
  sBlobUrls,
  sAbort,
  sClient,
  sIframeSrc,
  sLocation,
} from "./win";

import hook from "./jsHooks";
// @ts-ignore
import moduleRewrite from "./rewriters/modules";
import jsRewrite from "./rewriters/js";
import elementRewrite from "./rewriters/html";
// history is saved on context basis
const historyId = Math.random().toString(36);

const contentHistory = new Map<string, ContentHistory>();

function getContentHistoryId() {
  for (let i = 0; ; i++) {
    const id = `PortaProxy_${historyId}_${i}`;
    if (!contentHistory.has(id)) return id;
  }
}

window.addEventListener("popstate", (event) => {
  const data = contentHistory.get(event.state);
  if (data) openWindow(data.req, "_self", data.win, data.client, false);
});

/**
 * Cleanup history for window
 * Maybe called when an iframe is deleted during a redirect in the parent window
 * Or the React component is unmounted
 */
export async function deleteWindow(win: Win, deleteHistory = true) {
  if (deleteHistory)
    for (const [key, val] of contentHistory)
      if (val.win === win) contentHistory.delete(key);
  if (sAbort in win) win[sAbort].abort();
  if (sBlobUrls in win)
    for (const url of win[sBlobUrls]) URL.revokeObjectURL(url);
  if (sTimeouts in win)
    for (const timeout of win[sTimeouts]) clearTimeout(timeout);
  for (const iframe of win.document.querySelectorAll("iframe"))
    if (iframe.contentWindow)
      deleteWindow(iframe.contentWindow as unknown as Win);
}

export default async function openWindow(
  req: Request,
  target: string,
  win: Win,
  client: BareClient,
  // push = clicked link
  // replace = created main frame
  // false = going back in history
  setHistory: "push" | "replace" | false = "push"
) {
  (win as unknown as HTMLIFrameElement).src = ""; // this clears any currently executing javascript
  const n = win.open(undefined, target) as unknown as Win | null;
  if (!n) return console.error("failure");
  deleteWindow(n, false);
  // n.location.assign("about:blank");
  setTimeout(() => {
    if (history) {
      const id = getContentHistoryId();
      contentHistory.set(id, {
        client,
        req,
        win: n,
      });
      if (setHistory === "push") history.pushState(id, "", undefined);
      else if (setHistory === "replace")
        history.replaceState(id, "", undefined);
    }
    loadDOM(req, n as unknown as Win, client);
  }, 10);
}


async function loadDOM(req: Request, win: Win, client: BareClient) {
  if (!client) throw new TypeError("bad client");
  win[sAbort] = new AbortController();
  win[sClient] = client;
  win[sBlobUrls] = [];
  win[sTimeouts] = [];

  const scripts: string[] = [];
  const scriptsDeferred: string[] = [];
  const pushScript = async (script: HTMLScriptElement, code: string, relativePath: string) => {
    if (script.type !== "module") {
      if (script.defer)
        scriptsDeferred.push(jsRewrite(code));
      else
        scripts.push(jsRewrite(code))
    } else {
      try {
        const packed = await moduleRewrite(code, new URL(`${relativePath}/dummy.js`), win);
        if (script.defer)
          scriptsDeferred.push(jsRewrite(packed));
        else
          scripts.push(jsRewrite(packed));
      } catch (e) {
        console.error(`packer failed! - ${e}`);
      }
    }
  }

  const res = await request(req, "document", win);
  // win properties may have cleared in the time it took to do an async request...
  // set them again
  // win[sClient] = client;

  win[sLocation] = new URL(res.finalURL);

  const protoDom = new win.DOMParser().parseFromString(
    await res.text(),
    "text/html"
  );

  const base = document.createElement("base");
  base.href = win[sLocation].toString();
  protoDom.head.append(base);
  win.document.head.append(base.cloneNode());



  for (const elm of protoDom.querySelectorAll("*")) {
    await elementRewrite(elm, win, pushScript, (event: any, node: any) => {

      event.preventDefault();

      const protocol = new URL(node.href).protocol;

      if (protocol === "javascript:") return;

      let winTarget = event.shiftKey
        ? "new"
        : event.ctrlKey || event.button === 1
          ? "_blank"
          : node.target || "_self";
      if (
        (winTarget === "_top" && win.top === window) ||
        (winTarget === "_parent" && win.parent === window)
      )
        winTarget = "_self";

      if (!validProtocols.includes(protocol))
        return win.open(node.href, winTarget);

      openWindow(new Request(node.href), winTarget, win, client);

    });
  }


  const refreshHeader =
    protoDom.querySelector<HTMLMetaElement>("meta[http-equiv='refresh']")
      ?.content || res.headers.get("refresh");

  if (refreshHeader) {
    const refresh = parseRefreshHeader(refreshHeader, win);

    if (refresh)
      win[sTimeouts].push(
        setTimeout(
          () => openWindow(new Request(refresh.url), "_self", win, client),
          refresh.duration
        )
      );
  }



  win.document.open();
  hook(win.window);

  if (protoDom.doctype)
    win.document.write(`<!DOCTYPE ${protoDom.doctype.name}>`);

  win.document.documentElement?.remove();
  win.document.append(protoDom.documentElement);
  for (const code of scripts) {
    try {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.innerHTML = code;
      win.document.head.appendChild(script);
    } catch (e) {
      console.error(e);
    }
  }
  win.document.close();
  for (const code of scriptsDeferred) {
    try {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.innerHTML = code;
      script.defer = true;
      win.document.head.appendChild(script);
    } catch (e) {
      console.error(e);
    }
  }
}
