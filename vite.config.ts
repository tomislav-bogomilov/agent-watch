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
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});