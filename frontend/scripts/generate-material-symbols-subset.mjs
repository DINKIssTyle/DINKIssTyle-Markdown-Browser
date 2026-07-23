import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, '..');
const iconListPath = resolve(scriptDirectory, 'material-symbols-icons.txt');
const outputPath = resolve(frontendDirectory, 'src/assets/fonts/material-symbols-outlined.woff2');

const iconNames = (await readFile(iconListPath, 'utf8'))
    .split(/\r?\n/)
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('#'));

const sortedIconNames = [...new Set(iconNames)].sort();
if (iconNames.join('\n') !== sortedIconNames.join('\n')) {
    throw new Error('material-symbols-icons.txt must be sorted and contain no duplicates.');
}
if (iconNames.some(name => !/^[a-z0-9_]+$/.test(name))) {
    throw new Error('Material Symbol names may only contain lowercase letters, numbers, and underscores.');
}

const cssURL = new URL('https://fonts.googleapis.com/css2');
cssURL.searchParams.set('family', 'Material Symbols Outlined');
cssURL.searchParams.set('icon_names', iconNames.join(','));
cssURL.searchParams.set('display', 'block');

const cssResponse = await fetch(cssURL, {
    headers: {
        'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36',
    },
});
if (!cssResponse.ok) {
    throw new Error(`Google Fonts CSS request failed: ${cssResponse.status} ${cssResponse.statusText}`);
}

const css = await cssResponse.text();
const fontURL = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"]woff2['"]\)/)?.[1];
if (!fontURL) {
    throw new Error('The Google Fonts response did not contain a WOFF2 font URL.');
}

const fontResponse = await fetch(fontURL);
if (!fontResponse.ok) {
    throw new Error(`Google Fonts download failed: ${fontResponse.status} ${fontResponse.statusText}`);
}

const font = Buffer.from(await fontResponse.arrayBuffer());
if (font.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error('Downloaded file is not a valid WOFF2 font.');
}

await writeFile(outputPath, font);
console.log(`Wrote ${iconNames.length} Material Symbols (${font.length} bytes) to ${outputPath}`);
