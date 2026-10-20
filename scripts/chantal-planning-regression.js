/**
 * Alias: draait de Chantal never-again suite.
 * Bewaard zodat bestaande npm/CI-aanroepen blijven werken.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [path.join(here, 'chantal-never-again-regression.js')], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
