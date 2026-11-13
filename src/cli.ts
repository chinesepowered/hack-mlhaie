import { readFile, writeFile } from 'node:fs/promises';
import type { Ticket } from './agents.ts';
import { hasKeys } from './config.ts';
import { runShift } from './factory.ts';
import { Shift, saveRecord, toRecord, type TimedEvent } from './ledger.ts';
import { renderLedger } from './report.ts';

// Usage: pnpm shift [--sloppy] [--only CAPY-2] [--save-as demo]
const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

if (!hasKeys()) {
  console.error('Set TYPESAFE_API_KEY and LLM_API_KEY in .env (see .env.example).');
  process.exit(1);
}

const allTickets = JSON.parse(await readFile('tickets/demo.json', 'utf8')) as Ticket[];
const only = option('--only')?.split(',');
const tickets = only ? allTickets.filter((t) => only.includes(t.id)) : allTickets;

const shift = new Shift(`shift-${new Date().toISOString().replace(/[:.]/g, '-')}`);
shift.subscribe((event) => console.log(describe(event)));
await runShift(shift, { tickets, sloppy: args.includes('--sloppy'), targetDir: 'target', workDir: `.workspaces/${shift.id}` });

const record = toRecord(shift);
await saveRecord(record, `runs/${shift.id}.json`);
const saveAs = option('--save-as');
if (saveAs) {
  await saveRecord(record, `runs/${saveAs}.json`);
  await writeFile(`runs/${saveAs}.md`, renderLedger(record));
}
console.log(`\nSaved runs/${shift.id}.json${saveAs ? ` and runs/${saveAs}.json` : ''}`);

function describe(event: TimedEvent): string {
  const at = `${(event.t / 1000).toFixed(1).padStart(6)}s`;
  switch (event.type) {
    case 'jev.call':
      return `${at}  ${event.ticketId} ${event.stage}: Jev ${event.latencyMs}ms\n${event.decisions
        .map((d) => `           ${d.passed === false ? '✗' : d.passed ? '✓' : '·'} ${d.label}: ${d.display}`)
        .join('\n')}`;
    case 'agent.output':
      return `${at}  ${event.ticketId} build #${event.attempt} by ${event.agent} (${event.latencyMs}ms): ${event.summary}`;
    case 'tests.result':
      return `${at}  ${event.ticketId} tests: ${event.passed ? 'pass' : 'FAIL'} (${event.summary})`;
    case 'ticket.outcome':
      return `${at}  ${event.ticketId} → ${event.outcome.toUpperCase()} after ${event.attempts} attempt(s): ${event.reason}`;
    case 'run.end':
      return `${at}  totals ${JSON.stringify(event.totals)}`;
    case 'log':
      return `${at}  [${event.level}] ${event.message}`;
    default:
      return `${at}  ${event.type}${'ticketId' in event ? ` ${event.ticketId}` : ''}${'stage' in event ? ` ${event.stage}` : ''}`;
  }
}
