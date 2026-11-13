import { writeFile } from 'node:fs/promises';
import { loadRecord } from './ledger.ts';
import { renderLedger } from './report.ts';

// Usage: pnpm ledger runs/demo.json   (writes runs/demo.md)
const file = process.argv[2] ?? 'runs/demo.json';
const out = file.replace(/\.json$/, '.md');
await writeFile(out, renderLedger(await loadRecord(file)));
console.log(`Wrote ${out}`);
