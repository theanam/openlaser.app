/**
 * Renders PWA icons and the social preview image from the brand SVGs with headless Chromium.
 * Run after changing logo/*.svg or the README screenshot: `pnpm icons`.
 */
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appIcon = readFileSync(`${root}public/app-icon.svg`, 'utf8');
const mark = readFileSync(`${root}public/mark.svg`, 'utf8');
const screenshot = `${root}docs/screenshot.png`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, width, height, out, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`,
  );
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${root}${out}`, omitBackground: transparent });
  console.log('wrote', out);
}

const sized = (svg, size) =>
  svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);

await render(sized(appIcon, 192), 192, 192, 'public/icon-192.png');
await render(sized(appIcon, 512), 512, 512, 'public/icon-512.png');
await render(sized(appIcon, 180), 180, 180, 'public/apple-touch-icon.png');
// Maskable: full-bleed red with the mark inside the 80% safe zone.
await render(
  `<div style="width:512px;height:512px;background:#C0392B;display:flex;align-items:center;justify-content:center">${sized(appIcon, 360).replace(/<rect[^>]*\/>/, '')}</div>`,
  512,
  512,
  'public/icon-maskable-512.png',
);

const shot = existsSync(screenshot)
  ? `data:image/png;base64,${readFileSync(screenshot).toString('base64')}`
  : null;
const fonts = `${root}node_modules/@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2`;
await render(
  `<style>@font-face{font-family:G;src:url(file://${fonts})}</style>
  <div style="width:1200px;height:630px;background:#0E0F11;color:#ECEDEE;font-family:G,system-ui;display:flex;overflow:hidden;position:relative">
    <div style="padding:72px 0 0 72px;display:flex;flex-direction:column;gap:28px;width:560px;z-index:1">
      <div style="display:flex;align-items:center;gap:18px">${sized(mark, 72)}<span style="font-size:52px;font-weight:600;letter-spacing:-0.045em">openlaser<span style="color:#8A9097">.app</span></span></div>
      <div style="font-size:64px;line-height:1.02;font-weight:600;letter-spacing:-0.05em">Your laser,<br>one tab away.</div>
      <div style="font-size:24px;line-height:1.4;color:#C9CCCF">Free, open source laser control for GRBL machines. Runs in your browser and works offline.</div>
    </div>
    ${shot ? `<img src="${shot}" style="position:absolute;left:640px;top:70px;width:900px;border-radius:14px;border:1px solid #2A2E33">` : ''}
  </div>`,
  1200,
  630,
  'public/og-image.png',
  false,
);

await browser.close();
