/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Brand identifier: 'imoreme' | 'moreme' */
  readonly VITE_BRAND: string;
  /** Formal product name: "ClawPlus" | "MoremeClaw" */
  readonly VITE_APP_NAME: string;
  /** UI display name (camelCase): "clawPlus" | "MoremeClaw" */
  readonly VITE_APP_NAME_DISPLAY: string;
  /** One-line app description */
  readonly VITE_APP_DESCRIPTION: string;
  /** Author / copyright holder */
  readonly VITE_APP_AUTHOR: string;
  /** Electron app ID */
  readonly VITE_APP_ID: string;
  /** Website URL */
  readonly VITE_WEBSITE_URL: string;
  /** GitHub repository URL */
  readonly VITE_GITHUB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
