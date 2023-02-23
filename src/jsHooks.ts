import jsRewrite from "./rewriters/js";
export default function hook(win: Window) {
    const api = {
        hook,
        jsRewrite
    };


    // @ts-ignore
    win["__corium"] = api;
}