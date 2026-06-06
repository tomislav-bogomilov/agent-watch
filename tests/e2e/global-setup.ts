import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wipe the e2e usage dir so every run starts from empty history —
// otherwise rows merged from older fixture versions linger forever.
export default async function globalSetup(): Promise<void> {
  await fs.rm(path.resolve(__dirname, '../../.local/e2e-usage'), { recursive: true, force: true });
}
