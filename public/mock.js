/* Mock event stream for the CapyWorks dashboard. No backend needed.
 *
 *   index.html?mock=1              replay the recorded-style shift from the start
 *   index.html?mock=1&speed=2      play twice as fast
 *   index.html?mock=1&at=9500      jump to t=9.5s (Capy rejects the sloppy attempt), then keep playing
 *   index.html?mock=1&at=end       jump straight to the finished shift
 *   ...&pause=1                    freeze after the jump (handy for screenshots)
 *
 * Events go through window.CapyDash.handle(), the same path the SSE stream uses.
 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const speed = Math.max(0.1, Number(params.get('speed')) || 1);
  const atParam = params.get('at');
  const pause = params.has('pause');
  const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
  const MODELS = { system1: 'jev-1.14.0', system2: 'Qwen/Qwen3.8-27B' };

  const TICKETS = {
    T1: { id: 'T1', title: 'Add soakTimeLeft(booking, now)', body: "Return the whole minutes left in a booking's soak, never below zero. Cover it with tests." },
    T2: { id: 'T2', title: 'Make the onsen better', body: 'make it nicer and faster pls' },
    T3: { id: 'T3', title: 'Add yuzuCount(guests)', body: 'One yuzu per guest in the bath, but never more than 3 per bath (house rule). Add tests.' },
    T4: { id: 'T4', title: 'Validate party size in bookSoak()', body: 'Reject parties smaller than 1 or larger than 6 with a clear error. Add boundary tests.' },
  };

  // ---------------------------------------------------------------- decisions

  // wantYes: the check passes when P(yes) >= threshold; otherwise it passes when P(yes) < threshold.
  const noul = (id, label, p, threshold, wantYes) =>
    ({ id, label, type: 'noul', value: p, display: `P(yes) ${p.toFixed(2)}`, threshold, passed: wantYes ? p >= threshold : p < threshold });
  const info = (id, label, type, value, display) => ({ id, label, type, value, display, threshold: null, passed: null });

  const intake = (specific, criteria) => [
    noul('specific', 'Specific enough to build?', specific, 0.6, true),
    noul('criteria', 'Has testable acceptance criteria?', criteria, 0.5, true),
  ];
  const triage = (kind, kindP, risk, riskLabel) => [
    info('kind', 'Ticket type', 'choice', kindP, `${kind} · ${kindP.toFixed(2)}`),
    info('risk', 'Risk', 'score', risk, riskLabel),
  ];
  const gate = ([placeholder, scope, debug, dupe, tests]) => [
    noul('placeholder', 'Placeholder or TODO code?', placeholder, 0.5, false),
    noul('scope', 'Changes outside the ticket?', scope, 0.5, false),
    noul('debug', 'Debug logs or dead code?', debug, 0.5, false),
    noul('duplicate', 'Duplicates an existing helper?', dupe, 0.5, false),
    noul('tests', 'Tests cover the new behavior?', tests, 0.6, true),
  ];

  // ---------------------------------------------------------------- diffs

  const DIFF_T1 = `diff --git a/src/onsen.ts b/src/onsen.ts
--- a/src/onsen.ts
+++ b/src/onsen.ts
@@ -21,3 +21,9 @@ export function bookSoak(party: readonly Guest[], minutes: number): Booking {
   return { party, startsAt: Date.now(), minutes };
 }
+
+/** Whole minutes left in a booking's soak, never below zero. */
+export function soakTimeLeft(booking: Booking, now: number): number {
+  const endsAt = booking.startsAt + booking.minutes * MINUTE;
+  return Math.max(0, Math.ceil((endsAt - now) / MINUTE));
+}
diff --git a/test/onsen.test.ts b/test/onsen.test.ts
--- a/test/onsen.test.ts
+++ b/test/onsen.test.ts
@@ -30,0 +31,10 @@
+test('soakTimeLeft counts down in whole minutes', () => {
+  const booking = { party: [capy], startsAt: 0, minutes: 30 };
+  assert.equal(soakTimeLeft(booking, 10 * MINUTE), 20);
+  assert.equal(soakTimeLeft(booking, 10 * MINUTE + 1), 20);
+});
+
+test('soakTimeLeft never goes negative', () => {
+  const booking = { party: [capy], startsAt: 0, minutes: 30 };
+  assert.equal(soakTimeLeft(booking, 45 * MINUTE), 0);
+});`;

  const DIFF_T3_SLOPPY = `diff --git a/src/onsen.ts b/src/onsen.ts
--- a/src/onsen.ts
+++ b/src/onsen.ts
@@ -27,0 +28,13 @@
+// TODO: handle edge cases later
+export function yuzuCount(guests: any) {
+  console.log('yuzuCount called with', guests);
+  let count = 0;
+  for (let i = 0; i < guests.length; i++) {
+    count = count + 1;
+  }
+  return count;
+}
+
+function oldYuzuCount(g: any) {
+  return g.length; // not used anymore
+}
diff --git a/src/pricing.ts b/src/pricing.ts
--- a/src/pricing.ts
+++ b/src/pricing.ts
@@ -1,3 +1,3 @@
-export const BATH_PRICE_YEN = 1200;
+export const BATH_PRICE_YEN = 1500;
 export const YUZU_PRICE_YEN = 80;
 export const MAX_GUESTS = 6;
diff --git a/test/onsen.test.ts b/test/onsen.test.ts
--- a/test/onsen.test.ts
+++ b/test/onsen.test.ts
@@ -40,0 +41,4 @@
+test('yuzuCount works', () => {
+  yuzuCount([capy]);
+  assert.ok(true);
+});`;

  const DIFF_T3_CLEAN = `diff --git a/src/onsen.ts b/src/onsen.ts
--- a/src/onsen.ts
+++ b/src/onsen.ts
@@ -27,0 +28,6 @@
+const MAX_YUZU_PER_BATH = 3;
+
+/** One yuzu per guest in the bath, capped by the house rule. */
+export function yuzuCount(guests: readonly Guest[]): number {
+  return Math.min(guests.length, MAX_YUZU_PER_BATH);
+}
diff --git a/test/onsen.test.ts b/test/onsen.test.ts
--- a/test/onsen.test.ts
+++ b/test/onsen.test.ts
@@ -40,0 +41,6 @@
+test('yuzuCount gives one yuzu per guest, capped at 3', () => {
+  assert.equal(yuzuCount([]), 0);
+  assert.equal(yuzuCount(guests(2)), 2);
+  assert.equal(yuzuCount(guests(3)), 3);
+  assert.equal(yuzuCount(guests(5)), 3);
+});`;

  const DIFF_T4 = `diff --git a/src/onsen.ts b/src/onsen.ts
--- a/src/onsen.ts
+++ b/src/onsen.ts
@@ -18,4 +18,7 @@ export interface Booking {
 export function bookSoak(party: readonly Guest[], minutes: number): Booking {
+  if (party.length < MIN_PARTY || party.length > MAX_PARTY) {
+    throw new RangeError(\`Party size must be \${MIN_PARTY}-\${MAX_PARTY}, got \${party.length}\`);
+  }
   return { party, startsAt: Date.now(), minutes };
 }
diff --git a/test/onsen.test.ts b/test/onsen.test.ts
--- a/test/onsen.test.ts
+++ b/test/onsen.test.ts
@@ -46,0 +47,5 @@
+test('bookSoak rejects parties outside 1-6', () => {
+  assert.throws(() => bookSoak([], 30), RangeError);
+  assert.throws(() => bookSoak(guests(7), 30), RangeError);
+  assert.doesNotThrow(() => bookSoak(guests(6), 30));
+});`;

  // ---------------------------------------------------------------- one ticket's trip through the factory

  function pipeline(id, start, plan, rand) {
    const out = [];
    let t = start;
    const push = (dt, evt) => { t += dt; out.push({ t: Math.round(t), ...evt }); };
    const jev = (stage, attempt, decisions, latencyMs, inputTokens) =>
      ({ type: 'jev.call', ticketId: id, stage, attempt, latencyMs, inputTokens, model: MODELS.system1, decisions });
    const lat = () => Math.round(128 + rand() * 110);

    push(0, { type: 'ticket.stage', ticketId: id, stage: 'intake', attempt: 1 });
    push(380, jev('intake', 1, plan.intake, lat(), 352 + Math.round(rand() * 60)));
    if (plan.bounce) {
      push(260, { type: 'ticket.stage', ticketId: id, stage: 'bounced', attempt: 1 });
      push(40, { type: 'ticket.outcome', ticketId: id, outcome: 'bounced', attempts: 1, reason: plan.bounce });
      push(20, { type: 'log', level: 'warn', message: `Capy bounced ${id} at intake: ${plan.bounce}` });
      return out;
    }
    push(300, { type: 'ticket.stage', ticketId: id, stage: 'triage', attempt: 1 });
    push(320, jev('triage', 1, plan.triage, lat(), 410 + Math.round(rand() * 60)));

    plan.attempts.forEach((a, i) => {
      const n = i + 1;
      push(i ? 700 : 300, { type: 'ticket.stage', ticketId: id, stage: 'build', attempt: n });
      if (i) push(10, { type: 'log', level: 'info', message: `${id}: sent Capy's failed checks back to the agent for try ${n}` });
      push(a.agentMs, { type: 'agent.output', ticketId: id, attempt: n, agent: a.agent, summary: a.summary, files: a.files, diff: a.diff, latencyMs: a.agentMs });
      push(250, { type: 'ticket.stage', ticketId: id, stage: 'tests', attempt: n });
      push(800, { type: 'tests.result', ticketId: id, attempt: n, passed: a.tests.passed, summary: a.tests.summary, output: a.tests.output });
      push(250, { type: 'ticket.stage', ticketId: id, stage: 'gate', attempt: n });
      push(420, jev('gate', n, a.gate, a.gateMs, a.gateTokens));
    });

    const n = plan.attempts.length;
    push(520, { type: 'ticket.stage', ticketId: id, stage: 'onsen', attempt: n });
    push(40, { type: 'ticket.outcome', ticketId: id, outcome: 'merged', attempts: n, reason: plan.reason });
    push(20, { type: 'log', level: 'info', message: plan.log });
    return out;
  }

  function buildShift({ sloppy, mode }) {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    const cleanT3 = {
      agent: 'qwen', agentMs: 3100,
      summary: 'yuzuCount() gives one yuzu per guest, capped at 3 by a named constant. Tests cover 0, 2, 3 and 5 guests.',
      files: ['src/onsen.ts', 'test/onsen.test.ts'], diff: DIFF_T3_CLEAN,
      tests: { passed: true, summary: '7 passed, 0 failed', output: 'ok 6 - soakTimeLeft never goes negative\nok 7 - yuzuCount gives one yuzu per guest, capped at 3\n# pass 7 · fail 0' },
      gate: gate([0.02, 0.05, 0.03, 0.09, 0.94]), gateMs: 158, gateTokens: 1962,
    };
    const sloppyT3 = {
      agent: 'sloppy', agentMs: 1400,
      summary: 'Implemented yuzuCount. TODO: edge cases. Also bumped the bath price while I was in there.',
      files: ['src/onsen.ts', 'src/pricing.ts', 'test/onsen.test.ts'], diff: DIFF_T3_SLOPPY,
      tests: { passed: true, summary: '7 passed, 0 failed', output: 'ok 6 - soakTimeLeft never goes negative\nok 7 - yuzuCount works\n# pass 7 · fail 0' },
      gate: gate([0.97, 0.84, 0.95, 0.18, 0.07]), gateMs: 187, gateTokens: 2214,
    };

    const events = [
      { t: 0, type: 'run.start', runId: mode === 'replay' ? 'demo' : 'mock-live', mode, models: MODELS, tickets: Object.values(TICKETS) },
      { t: 60, type: 'log', level: 'info', message: `Shift started: 4 tickets on the board${sloppy ? ' (sloppy agent on duty)' : ''}` },
      ...pipeline('T1', 300, {
        intake: intake(0.94, 0.91),
        triage: triage('feature', 0.97, 0.21, 'Limited'),
        attempts: [{
          agent: 'qwen', agentMs: 2600,
          summary: 'Added soakTimeLeft() that rounds up to whole minutes and clamps at zero, plus two tests.',
          files: ['src/onsen.ts', 'test/onsen.test.ts'], diff: DIFF_T1,
          tests: { passed: true, summary: '6 passed, 0 failed', output: 'ok 5 - soakTimeLeft counts down in whole minutes\nok 6 - soakTimeLeft never goes negative\n# pass 6 · fail 0' },
          gate: gate([0.03, 0.07, 0.02, 0.11, 0.92]), gateMs: 164, gateTokens: 1838,
        }],
        reason: 'All 5 Capy checks passed and the tests are green.',
        log: 'T1 merged on the first try.',
      }, rand),
      ...pipeline('T2', 1800, {
        intake: intake(0.06, 0.03),
        bounce: 'Too vague to build: no behavior or acceptance criteria.',
      }, rand),
      ...pipeline('T3', 5000, {
        intake: intake(0.89, 0.86),
        triage: triage('feature', 0.95, 0.27, 'Limited'),
        attempts: sloppy ? [sloppyT3, cleanT3] : [cleanT3],
        reason: sloppy ? 'Passed on try 2, after Capy bounced 4 slop signals on try 1.' : 'All 5 Capy checks passed and the tests are green.',
        log: sloppy ? 'T3 merged on try 2. The slop never reached main.' : 'T3 merged on the first try.',
      }, rand),
      ...pipeline('T4', 11600, {
        intake: intake(0.92, 0.95),
        triage: triage('bugfix', 0.71, 0.34, 'Limited'),
        attempts: [{
          agent: 'qwen', agentMs: 2400,
          summary: 'bookSoak() now throws a RangeError outside 1-6 guests. Added boundary tests for 0, 6 and 7.',
          files: ['src/onsen.ts', 'test/onsen.test.ts'], diff: DIFF_T4,
          tests: { passed: true, summary: '8 passed, 0 failed', output: 'ok 7 - yuzuCount gives one yuzu per guest, capped at 3\nok 8 - bookSoak rejects parties outside 1-6\n# pass 8 · fail 0' },
          gate: gate([0.02, 0.04, 0.02, 0.06, 0.95]), gateMs: 149, gateTokens: 1904,
        }],
        reason: 'All 5 Capy checks passed and the tests are green.',
        log: 'T4 merged on the first try.',
      }, rand),
    ].sort((a, b) => a.t - b.t);

    // totals, computed from the events so they always match what the dashboard counted
    const calls = events.filter((e) => e.type === 'jev.call');
    const outcomes = events.filter((e) => e.type === 'ticket.outcome');
    const jevInputTokens = calls.reduce((n, e) => n + e.inputTokens, 0);
    const totals = {
      jevRequests: calls.length,
      decisions: calls.reduce((n, e) => n + e.decisions.length, 0),
      jevMsAvg: Math.round(calls.reduce((n, e) => n + e.latencyMs, 0) / calls.length),
      jevInputTokens,
      jevCostUsd: jevInputTokens * JEV_USD_PER_INPUT_TOKEN,
      llmMsTotal: events.filter((e) => e.type === 'agent.output').reduce((n, e) => n + e.latencyMs, 0),
      merged: outcomes.filter((e) => e.outcome === 'merged').length,
      bounced: outcomes.filter((e) => e.outcome === 'bounced').length,
      escalated: outcomes.filter((e) => e.outcome === 'escalated').length,
      slopCaught: calls.filter((e) => e.stage === 'gate' && e.decisions.some((d) => d.passed === false)).length,
    };
    const lastT = events[events.length - 1].t;
    events.push({ t: lastT + 600, type: 'log', level: 'info', message: `Shift complete: ${totals.merged} merged, ${totals.bounced} bounced, ${totals.slopCaught} slop attempt caught.` });
    events.push({ t: lastT + 650, type: 'run.end', totals });
    return events;
  }

  // ---------------------------------------------------------------- playback

  let timers = [];
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  function play(events, jump) {
    stop();
    const send = (e) => window.CapyDash.handle(e);
    const cut = jump === 'end' ? Infinity : Math.max(0, Number(jump) || 0);
    for (const e of events) {
      if (e.t <= cut) send(e);
      else if (!pause) timers.push(setTimeout(() => send(e), (e.t - cut) / speed));
    }
  }

  window.CapyMock = {
    events: buildShift,
    start: ({ sloppy = false } = {}) => play(buildShift({ sloppy, mode: 'live' })),
    replay: () => play(buildShift({ sloppy: true, mode: 'replay' })),
    autostart: () => play(buildShift({ sloppy: true, mode: 'replay' }), atParam),
    stop,
  };
})();
