import fs from 'node:fs';
import vm from 'node:vm';

// Run the actual controllers with native I/O and rendering replaced by
// controllable promises, so races can be tested without a WebView.
export function controller(file, globals, exports, overrides = '') {
    const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
        .replace(/^import\s[\s\S]*?;\n/gm, '')
        .replace(/^export /gm, '')
        .replace(/import\.meta\.glob\([^;]+\)/g, '{}')
        .replace(/\bimport\(/g, '__import(');
    const context = vm.createContext({ console, setTimeout, clearTimeout, ...globals });
    return vm.runInContext(`${source}\n${overrides}\n;({${exports.join(',')}})`, context);
}
