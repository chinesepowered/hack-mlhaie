import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRecord } from '../src/ledger.ts';
import { renderLedger } from '../src/report.ts';

test('the demo ledger lists every decision with its result', async () => {
  const record = await loadRecord('runs/demo.json');
  const ledger = renderLedger(record);
  const decisionRows = ledger.split('\n').filter((line) => /^\| (intake|triage|gate) /.test(line));
  assert.equal(decisionRows.length, record.totals.decisions);
  assert.match(ledger, /\| gate \| 1 \| No TODOs or placeholders \| P\(yes\) 0\.98 .*\| \*\*FAIL\*\* \|/);
  assert.match(ledger, /## CAPY-3 · Make the onsen better\n\n\*\*bounced\*\*/);
});
