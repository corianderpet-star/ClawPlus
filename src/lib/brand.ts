/**
 * Centralized Brand Configuration (Renderer)
 *
 * All brand-specific values (names, logos, URLs) are read from Vite environment
 * variables defined in `.env.imoreme` / `.env.moreme`.
 *
 * Usage:
 *   import { APP_NAME, APP_NAME_DISPLAY, brandLogo } from '@/lib/brand';
 *
 * Build with brand:
 *   pnpm dev:imoreme   / pnpm dev:moreme
 *   pnpm build:imoreme / pnpm build:moreme
 */

// ---------------------------------------------------------------------------
// Brand identifier
// ---------------------------------------------------------------------------
export type BrandId = 'imoreme' | 'moreme';
export const BRAND: BrandId = (import.meta.env.VITE_BRAND || 'imoreme') as BrandId;

// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------
/** Formal product name: "ClawPlus" | "MoremeClaw" */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || 'ClawPlus';

/** UI display name (camelCase): "clawPlus" | "MoremeClaw" */
export const APP_NAME_DISPLAY: string = import.meta.env.VITE_APP_NAME_DISPLAY || 'clawPlus';

/** One-line description */
export const APP_DESCRIPTION: string =
  import.meta.env.VITE_APP_DESCRIPTION || 'ClawPlus - Graphical AI Assistant based on OpenClaw';

/** Author / copyright holder */
export const APP_AUTHOR: string = import.meta.env.VITE_APP_AUTHOR || 'ClawPlus Team';

// ---------------------------------------------------------------------------
// Logo — resolved at build-time via Vite glob import
// ---------------------------------------------------------------------------
const logoModules: Record<string, string> = import.meta.glob<string>(
  '/src/assets/brands/*/logo.png',
  { eager: true, import: 'default' },
);

function resolveLogo(): string {
  const key = `/src/assets/brands/${BRAND}/logo.png`;
  return logoModules[key] || '';
}

/** Brand-specific logo URL (already hashed by Vite) */
export const brandLogo: string = resolveLogo();

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------
export const WEBSITE_URL: string = import.meta.env.VITE_WEBSITE_URL || 'https://claw-x.com';
export const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL || 'https://github.com/ValueCell-ai/ClawPlus';
