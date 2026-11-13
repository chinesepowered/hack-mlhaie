import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Shift, computeTotals, toRecord } from '../src/ledger.ts';

function demoShift(): Shift {
  const shift = new Shift('shift-test');
  shift.emit({
    type: 'run.start',
    runId: 'shift-test',
    mode: 'live',
    models: { system1: 'jev-latest', system2: 'qwen' },
    tickets: [{ id: 'T1', title: 'Add yuzuNeeded', body: '...' }],
  });
  const gate = (passed: boolean, latencyMs: number) =>
    shift.emit({
      type: 'jev.call',
      ticketId: 'T1',
      stage: 'gate',
      attempt: 1,
      latencyMs,
      inputTokens: 500_000,
      model: 'jev-1.14.0',
      decisions: [
        { id: 'todo', label: 'No TODOs', type: 'noul', value: passed ? 0.1 : 0.9, display: '', threshold: 0.5, passed },
      ],
    });
  gate(false, 100);
  gate(true, 300);
  shift.emit({ type: 'ticket.outcome', ticketId: 'T1', outcome: 'merged', attempts: 2, reason: 'Capy-approved' });
  return shift;
}

test('totals count decisions, latency, cost and caught slop', () => {
  assert.deepEqual(computeTotals(demoShift().events), {
    jevRequests: 2,
    decisions: 2,
    jevMsAvg: 200,
    jevInputTokens: 1_000_000,
    jevCostUsd: 0.042,
    llmMsTotal: 0,
    merged: 1,
    bounced: 0,
    escalated: 0,
    slopCaught: 1,
  });
});

test('a record highlights the first rejected gate and each ticket outcome', () => {
  const record = toRecord(demoShift());
  assert.deepEqual(record.tickets, [{ id: 'T1', title: 'Add yuzuNeeded', outcome: 'merged', attempts: 2 }]);
  assert.deepEqual(record.highlight?.failed.map((f) => f.label), ['No TODOs']);
});

test('listeners see every event as it happens', () => {
  const shift = new Shift('s');
  const seen: string[] = [];
  shift.subscribe((event) => seen.push(event.type));
  shift.emit({ type: 'log', level: 'info', message: 'hi' });
  assert.deepEqual(seen, ['log']);
});
