
import { parseScript } from 'meriyah';

// borrow some ideas from https://github.com/titaniumnetwork-dev/Ultraviolet/blob/main/src/rewrite/rewrite.script.js
export default function rewrite(js: string): string {
    let AST = parseScript(js, {
        ranges: true,
        module: false,
        globalReturn: true,
    });

    window["ast"] = AST;




    return js;
}