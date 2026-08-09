/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sessionsPlugin } from './server/vite-plugin-sessions';
import { controlPlugin } from './server/vite-plugin-control';
import { narrativePlugin } from './server/vite-plugin-narrative';

export default defineConfig({
  plugins: [react(), sessionsPlugin(), controlPlugin(), narrativePlugin()],
  test: {
    environment: 'jsdom',
    // Node 25 exposes an incomplete process-global localStorage unless a
    // persistence file is configured. Disable it in workers so jsdom installs
    // its standards-compliant Storage implementation instead.
    poolOptions: {
      threads: { execArgv: ['--no-experimental-webstorage'] },
      forks: { execArgv: ['--no-experimental-webstorage'] },
    },
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
