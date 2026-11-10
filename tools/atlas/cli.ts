// Usage: npm run atlas -- validate [dir]
//        npm run atlas -- stability [dir] [ticks] [id prefix]   (default 30000 ticks per law set)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LawSetSchema } from '@/contracts/atlas';
import { factory } from './index';
import { survey } from './survey';

const [cmd = 'validate', dir = 'atlas/lawsets', ticksArg = '30000', only = ''] = process.argv.slice(2);
const tool = factory();
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let failed = 0;
const pulses = new Map<number, string>();
for (const f of files) {
  const raw: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const v = tool.validate(raw);
  const errors = [...v.errors];
  const law = v.ok ? LawSetSchema.parse(raw) : null;
  if (law) {
    if (`${law.id}.json` !== f) errors.push(`id "${law.id}" does not match the file name`);
    const other = pulses.get(law.pulseMilliHz);
    if (other) errors.push(`pulseMilliHz ${law.pulseMilliHz} is already used by ${other}`);
    pulses.set(law.pulseMilliHz, f);
  }
  if (only && !f.startsWith(only)) continue;
  if (cmd === 'stability' && law && errors.length === 0) {
    const s = survey(law, Number(ticksArg) || 30000);
    if (!s.ok) errors.push(s.reason);
    const show = (mix: typeof s.mix) => mix.filter(([, p]) => p >= 0.02).map(([n, p]) => `${n} ${p}`).join(', ');
    console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${law.id}: live ${(s.live / 100).toFixed(2)}% | ${show(s.mix)} | ${s.reason} | ${s.hash.toString(16)}`);
    if (process.argv.includes('--phases')) s.phases.forEach((p, i) => console.log(`       sky ${i + 1}: ${show(p)}`));
  } else {
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${f}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  }
  if (errors.length) failed++;
}
if (cmd !== 'validate' && cmd !== 'stability') console.log(`command "${cmd}" is not known; try validate or stability`);
process.exit(failed ? 1 : 0);
