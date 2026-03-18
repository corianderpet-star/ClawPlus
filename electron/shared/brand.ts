/**
 * Centralized Brand Configuration (Electron Main Process)
 *
 * Mirrors src/lib/brand.ts but for the main process.
 * The VITE_* values are statically replaced at build-time by the `define`
 * config in vite.config.ts (see the `brandDefine` map).
 *
 * Usage:
 *   import { APP_NAME, APP_NAME_DISPLAY } from '../shared/brand';
 */

// Vite replaces `import.meta.env.VITE_*` at build-time via the `define` map.
// We declare a local helper to avoid TS errors in the Node-side tsconfig
// (which doesn't include vite/client types).
declare global {
  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
}

export type BrandId = 'imoreme' | 'moreme';

export const BRAND: BrandId = (import.meta.env.VITE_BRAND || 'imoreme') as BrandId;

/** Formal product name: "ClawPlus" | "MoremeClaw" */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || 'ClawPlus';

/** UI display name (camelCase): "clawPlus" | "moremeClaw" */
export const APP_NAME_DISPLAY: string = import.meta.env.VITE_APP_NAME_DISPLAY || 'clawPlus';

/** One-line description */
export const APP_DESCRIPTION: string =
  import.meta.env.VITE_APP_DESCRIPTION || 'ClawPlus - Graphical AI Assistant based on OpenClaw';

/** Author / copyright holder */
export const APP_AUTHOR: string = import.meta.env.VITE_APP_AUTHOR || 'ClawPlus Team';

/** Website URL */
export const WEBSITE_URL: string = import.meta.env.VITE_WEBSITE_URL || 'https://claw-x.com';

/** GitHub repo URL */
export const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL || 'https://github.com/ValueCell-ai/ClawPlus';
