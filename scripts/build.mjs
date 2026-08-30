import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: {
    background: 'src/background.ts',
    panel: 'src/panel.ts',
    popup: 'src/popup.ts',
    content: 'src/content.ts'
  },
  bundle: true,
  outdir: dist,
  format: 'iife',
  target: 'chrome109',
  logLevel: 'info',
  legalComments: 'none'
});

const staticFiles = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'highlight.css',
  'LICENSE',
  'fonts/manrope-var.woff2',
  'fonts/jetbrains-mono-var.woff2',
  'fonts/OFL-Manrope.txt',
  'fonts/OFL-JetBrains-Mono.txt',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

for (const rel of staticFiles) {
  const from = path.join(root, rel);
  const to = path.join(dist, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.copyFileSync(
  path.join(root, 'src/docs-annotate.js'),
  path.join(dist, 'docs-annotate.js')
);
