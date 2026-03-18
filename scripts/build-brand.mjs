#!/usr/bin/env zx
/**
 * Brand Build Script
 *
 * Builds the application for a specific brand (imoreme / moreme).
 * Handles icon copying, Vite build with the correct mode, bundling,
 * and electron-builder with the brand-specific config.
 *
 * Usage:
 *   zx scripts/build-brand.mjs imoreme          # Build ClawPlus
 *   zx scripts/build-brand.mjs moreme           # Build MoremeClaw
 *   zx scripts/build-brand.mjs moreme --win     # Build MoremeClaw for Windows
 *   zx scripts/build-brand.mjs moreme --mac     # Build MoremeClaw for macOS
 *   zx scripts/build-brand.mjs moreme --linux   # Build MoremeClaw for Linux
 */

import { existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const brand = argv._[0];
if (!brand || !['imoreme', 'moreme'].includes(brand)) {
  console.error('❌ Usage: zx scripts/build-brand.mjs <imoreme|moreme> [--win|--mac|--linux]');
  process.exit(1);
}

// Collect platform flags (pass through to electron-builder)
const platformFlags = [];
if (argv.win) platformFlags.push('--win');
if (argv.mac) platformFlags.push('--mac');
if (argv.linux) platformFlags.push('--linux');

const root = resolve(__dirname, '..');

console.log(`\n🏷️  Building brand: ${brand}`);
console.log(
  `📦  Platform flags: ${platformFlags.length ? platformFlags.join(' ') : '(current platform)'}\n`
);

// ---------------------------------------------------------------------------
// Step 1: Copy brand icons into resources/icons/ (overwrite)
// ---------------------------------------------------------------------------
const brandIconsDir = resolve(root, `resources/brands/${brand}/icons`);
const targetIconsDir = resolve(root, 'resources/icons');

if (existsSync(brandIconsDir)) {
  console.log(`📋  Copying brand icons: ${brandIconsDir} → ${targetIconsDir}`);
  cpSync(brandIconsDir, targetIconsDir, { recursive: true, force: true });
} else {
  console.log(`⚠️  Brand icons directory not found: ${brandIconsDir}, using default icons`);
}

// ---------------------------------------------------------------------------
// Step 2: Copy brand favicon into public/
// ---------------------------------------------------------------------------
const brandFavicon = resolve(root, `resources/brands/${brand}/favicon.ico`);
const targetFavicon = resolve(root, 'public/favicon.ico');

if (existsSync(brandFavicon)) {
  console.log(`📋  Copying brand favicon: ${brandFavicon} → ${targetFavicon}`);
  cpSync(brandFavicon, targetFavicon, { force: true });
}

// ---------------------------------------------------------------------------
// Step 3: Vite build with brand mode
// ---------------------------------------------------------------------------
console.log(`\n🔨  Running vite build --mode ${brand}...\n`);
await $`npx vite build --mode ${brand}`;

// ---------------------------------------------------------------------------
// Step 4: Bundle OpenClaw
// ---------------------------------------------------------------------------
console.log('\n📦  Bundling OpenClaw...\n');
await $`zx scripts/bundle-openclaw.mjs`;

// ---------------------------------------------------------------------------
// Step 5: Bundle OpenClaw plugins
// ---------------------------------------------------------------------------
console.log('\n📦  Bundling OpenClaw plugins...\n');
await $`zx scripts/bundle-openclaw-plugins.mjs`;

// ---------------------------------------------------------------------------
// Step 6: electron-builder with brand config
// ---------------------------------------------------------------------------
const builderConfig = brand === 'moreme' ? 'electron-builder.moreme.yml' : 'electron-builder.yml';

console.log(
  `\n📦  Running electron-builder --config ${builderConfig} ${platformFlags.join(' ')}...\n`
);
await $`npx electron-builder --config ${builderConfig} ${platformFlags}`;

console.log(`\n✅  Brand build complete: ${brand}\n`);
