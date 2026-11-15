import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const directory = resolve(root, 'docs/entregables/assets');
const browser = await chromium.launch({ headless: true, timeout: 20000 });
console.log('Renderizador de diagramas iniciado.');
try {
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.svg'))) {
    const source = await readFile(resolve(directory, file), 'utf8');
    const width = Number(source.match(/width="(\d+)"/)?.[1] || 1400);
    const height = Number(source.match(/height="(\d+)"/)?.[1] || 1000);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1.5 });
    await page.setContent(`<html><body style="margin:0;width:${width}px;height:${height}px;background:white">${source}</body></html>`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.screenshot({ path: resolve(directory, file.replace('.svg', '.png')), fullPage: true, timeout: 10000 });
    console.log(`Diagrama generado: ${file}`);
    await page.close();
  }
} finally { await browser.close(); }
