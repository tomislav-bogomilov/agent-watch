/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sessionsPlugin } from './server/vite-plugin-sessions';

export default defineConfig({
  plugins: [react(), sessionsPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});