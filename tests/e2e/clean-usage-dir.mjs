// Wipes the e2e usage-history dir BEFORE vite boots. Must run inside the
// webServer command chain: Playwright launches the webServer plugin before
// globalSetup, so a globalSetup-based wipe would race the server's boot sync.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../../.local/e2e-usage', import.meta.url)), { recursive: true, force: true });
