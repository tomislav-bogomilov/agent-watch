import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureClaudeHome = path.resolve(__dirname, 'tests/fixtures/claude-projects');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      CLAUDE_HOME: fixtureClaudeHome,
      TG_USAGE_DIR: path.resolve(__dirname, '.local/e2e-usage'),
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
