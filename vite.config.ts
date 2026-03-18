import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env files (.env, .env.[mode]) so we can forward brand vars to electron builds
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Build a `define` map so Vite statically replaces import.meta.env.VITE_*
  // in **all** build targets (renderer + electron main + preload).
  const brandDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) {
      brandDefine[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }

  return {
    plugins: [
      react(),
      electron([
        {
          // Main process entry file
          entry: 'electron/main/index.ts',
          onstart(options) {
            options.startup();
          },
          vite: {
            define: brandDefine,
            build: {
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: ['electron', 'electron-store', 'electron-updater', 'ws'],
              },
            },
          },
        },
        {
          // Preload scripts entry file
          entry: 'electron/preload/index.ts',
          onstart(options) {
            options.reload();
          },
          vite: {
            define: brandDefine,
            build: {
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
      ]),
      renderer(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@electron': resolve(__dirname, 'electron'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
