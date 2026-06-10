// Rasterizes the single brand master (assets/brand/boardown.svg) into the
// per-shell app-icon binaries each build expects. Run via `pnpm icons` after
// changing the logo; the generated files are committed so normal builds / CI
// never need the rasterizer.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import png2icons from 'png2icons';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = resolve(root, 'assets/brand/boardown.svg');

// One PNG target per consumer: VS Code Marketplace wants 128, Electron's Linux
// build + runtime window icon want 512.
const pngTargets = [
  { out: 'packages/vscode/icon.png', size: 128 },
  { out: 'packages/electron/build/icon.png', size: 512 },
];

async function renderPng(svg, size) {
  return sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
}

async function write(relPath, data) {
  const abs = resolve(root, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
  console.log(`  ${relPath} (${(data.length / 1024).toFixed(1)} KB)`);
}

const svg = await readFile(master);
console.log(`generating icons from ${'assets/brand/boardown.svg'}`);

for (const { out, size } of pngTargets) {
  await write(out, await renderPng(svg, size));
}

// VS Code's command/tab button reuses the master mark as a small colored SVG,
// so it never drifts from the app icon. Drop the comment and shrink the default
// width/height; the 1024 viewBox keeps scaling it crisply.
const toolbarSvg = svg
  .toString()
  .replace(/^<!--[\s\S]*?-->\s*/, '')
  .replace('width="1024" height="1024"', 'width="24" height="24"');
await write('packages/vscode/media/board.svg', toolbarSvg);

// ICO (Windows) and ICNS (macOS) are built from a single high-res PNG;
// png2icons downscales it to every embedded size internally.
const hi = await renderPng(svg, 1024);
await write('packages/electron/build/icon.ico', png2icons.createICO(hi, png2icons.BICUBIC, 0, true));
await write('packages/electron/build/icon.icns', png2icons.createICNS(hi, png2icons.BICUBIC, 0));

console.log('done');
