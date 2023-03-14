import access from "./globals/accessor";
import jsRewrite from "./rewriters/js";
export default function hook(win: Window) {
    const api: any = {
        hook,
        jsRewrite
    };

    api["accessor"] = access(api);


    // @ts-ignore
    win["__corium"] = api;
}
