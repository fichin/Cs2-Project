import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { checkWsUrl } from './src/lib/wsUrlCheck';

/** Fails (on a deploy host) or warns when a production build has no usable VITE_WS_URL. */
function wsUrlGuard(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'esports-live:ws-url-guard',
    apply: 'build',
    buildStart() {
      const result = checkWsUrl(env);
      if (result.level === 'error') this.error(result.message);
      if (result.level === 'warn') this.warn(result.message);
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = { ...process.env, ...loadEnv(mode, root, 'VITE_') };
  return {
    plugins: [react(), wsUrlGuard(env)],
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
