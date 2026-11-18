/**
 * Foe paintings are no longer rubber stamps.
 * The masters sit in art/foe-masters/, painted the same way as the rear ships.
 * This command bakes those masters into idle, wind, hit, and destruction frames.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bake-foes.mjs');
const child = spawn(process.execPath, [script], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
