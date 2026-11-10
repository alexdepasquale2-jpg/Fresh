// Usage: npm run atlas -- validate [dir]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { factory } from './index';

const [cmd = 'validate', dir = 'atlas/lawsets'] = process.argv.slice(2);
const tool = factory();
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
let failed = 0;
for (const f of files) {
  const raw: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const v = tool.validate(raw);
  if (cmd === 'validate') {
    console.log(`${v.ok ? 'ok  ' : 'FAIL'} ${f}${v.errors.length ? `\n  ${v.errors.join('\n  ')}` : ''}`);
  }
  if (!v.ok) failed++;
}
if (cmd !== 'validate') console.log(`command "${cmd}" not implemented yet (unit 08)`);
process.exit(failed ? 1 : 0);
