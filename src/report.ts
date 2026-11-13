import type { Verdict } from './checks.ts';
import type { ShiftRecord, TimedEvent } from './ledger.ts';

const RESULT: Record<string, string> = { true: 'pass', false: '**FAIL**', null: '·' };

/** Render a shift as a Markdown decision ledger: every System 1 call, per ticket. */
export function renderLedger(record: ShiftRecord): string {
  const { totals, models } = record;
  const lines = [
    `# Decision ledger · ${record.runId}`,
    '',
    `System 1: \`${models.system1}\` · System 2: \`${models.system2}\``,
    '',
    `- **${totals.decisions} decisions** in ${totals.jevRequests} Jev calls, ${totals.jevMsAvg} ms average, $${totals.jevCostUsd.toFixed(6)} total`,
    `- ${(totals.llmMsTotal / 1000).toFixed(1)} s of LLM build time`,
    `- ${totals.merged} merged · ${totals.bounced} bounced · ${totals.escalated} escalated · ${totals.slopCaught} sloppy attempt(s) caught`,
  ];
  for (const ticket of record.tickets) {
    const events = record.events.filter((e) => 'ticketId' in e && e.ticketId === ticket.id);
    lines.push('', `## ${ticket.id} · ${ticket.title}`, '', `**${ticket.outcome}** after ${ticket.attempts} attempt(s)`);
    lines.push('', '| Stage | Attempt | Check | Answer | Threshold | Result |', '|---|---|---|---|---|---|');
    for (const event of events) lines.push(...rowsFor(event));
  }
  return `${lines.join('\n')}\n`;
}

function rowsFor(event: TimedEvent): string[] {
  switch (event.type) {
    case 'jev.call':
      return event.decisions.map((d) => decisionRow(event.stage, event.attempt, d, event.latencyMs));
    case 'agent.output':
      return [`| build | ${event.attempt} | ${event.agent} agent | ${escape(event.summary)} | | |`];
    case 'tests.result':
      return [`| tests | ${event.attempt} | node:test | ${event.summary} | | ${event.passed ? 'pass' : '**FAIL**'} |`];
    default:
      return [];
  }
}

function decisionRow(stage: string, attempt: number, d: Verdict, latencyMs: number): string {
  const threshold = d.threshold === null ? '' : d.threshold.toFixed(2);
  return `| ${stage} | ${attempt || ''} | ${d.label} | ${d.display} (${latencyMs} ms call) | ${threshold} | ${RESULT[String(d.passed)]} |`;
}

function escape(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
