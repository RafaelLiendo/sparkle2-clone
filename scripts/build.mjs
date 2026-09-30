// Builds a self-contained dist/index.html (JS bundle and CSS inlined) plus the web app
// manifest and icons: `npm run build`.
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}dist/index.html`;

const { outputFiles } = await build({
  entryPoints: [`${ROOT}src/main.js`],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  write: false,
});
const js = outputFiles[0].text;

const cssResult = await build({
  entryPoints: [`${ROOT}styles.css`],
  bundle: true,
  minify: true,
  write: false,
});
const css = cssResult.outputFiles[0].text;

// `</` inside inlined code would end the enclosing tag early.
const escapeClose = (code, tag) => code.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');

let html = await readFile(`${ROOT}index.html`, 'utf8');
const swap = (pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`build: ${pattern} not found in index.html`);
  html = html.replace(pattern, () => replacement);
};
swap(/<link rel="stylesheet" href="styles\.css" \/>/, `<style>${escapeClose(css, 'style')}</style>`);
swap(/<script type="module" src="src\/main\.js"><\/script>/, `<script type="module">${escapeClose(js, 'script')}</script>`);

await mkdir(`${ROOT}dist`, { recursive: true });
await writeFile(OUT, html);
// the web app manifest and its icons stay separate files (Add to Home Screen / install)
for (const f of ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']) await copyFile(`${ROOT}${f}`, `${ROOT}dist/${f}`);
console.log(`Wrote dist/index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
