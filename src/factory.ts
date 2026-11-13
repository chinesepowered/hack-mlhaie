import path from 'node:path';
import { replaySloppyPatch, writeCode, type Ticket } from './agents.ts';
import {
  GATE_CHECKS,
  HUMAN_REVIEW_RISK,
  INTAKE_CHECKS,
  TRIAGE_QUESTIONS,
  asQuestions,
  describeAnswer,
  judge,
  type Verdict,
} from './checks.ts';
import { config } from './config.ts';
import { decide, type Decisions } from './jev.ts';
import { computeTotals, type Outcome, type Shift, type Stage } from './ledger.ts';
import { applyEdits, cloneDir, diffDirs, readSources, runTests } from './workspace.ts';

export interface ShiftOptions {
  tickets: readonly Ticket[];
  /** Demo mode: a ticket's first attempt replays its recorded sloppy patch. */
  sloppy: boolean;
  /** The repository the factory works on. It is never modified. */
  targetDir: string;
  /** Scratch space: `main/` plus one folder per attempt. */
  workDir: string;
}

/**
 * Run every ticket through the line:
 * intake → triage → build → tests → gate → onsen (merged).
 * System 2 (the LLM) only writes code; every judgment call is a System 1 decision.
 */
export async function runShift(shift: Shift, options: ShiftOptions): Promise<void> {
  const mainDir = path.join(options.workDir, 'main');
  await cloneDir(options.targetDir, mainDir);
  shift.emit({
    type: 'run.start',
    runId: shift.id,
    mode: 'live',
    models: { system1: config.jev.model, system2: config.llm.model },
    tickets: options.tickets.map(({ id, title, body }) => ({ id, title, body })),
  });
  for (const ticket of options.tickets) {
    try {
      await runTicket(shift, ticket, { ...options, mainDir });
    } catch (error) {
      shift.emit({ type: 'log', level: 'error', message: `${ticket.id}: ${(error as Error).message}` });
      finish(shift, ticket, 'escalated', 0, 'The line jammed, so a human takes over');
    }
  }
  shift.emit({ type: 'run.end', totals: computeTotals(shift.events) });
}

async function runTicket(shift: Shift, ticket: Ticket, options: ShiftOptions & { mainDir: string }): Promise<void> {
  const enter = (stage: Stage, attempt = 0) => shift.emit({ type: 'ticket.stage', ticketId: ticket.id, stage, attempt });
  const ticketState = `TICKET ${ticket.id}: ${ticket.title}\n\n${ticket.body}`;

  enter('intake');
  const intake = await decide(ticketState, asQuestions(INTAKE_CHECKS));
  const intakeVerdicts = INTAKE_CHECKS.map((check) => judge(check, intake.answers[check.id]));
  record(shift, ticket, 'intake', 0, intake, intakeVerdicts);
  if (intakeVerdicts.some((v) => v.passed === false)) {
    return finish(shift, ticket, 'bounced', 0, 'Too vague to build: Capy asks for a clearer spec');
  }

  enter('triage');
  const triage = await decide(ticketState, TRIAGE_QUESTIONS);
  const risk = describeAnswer('risk', 'Risk if shipped unreviewed', triage.answers.risk);
  record(shift, ticket, 'triage', 0, triage, [describeAnswer('kind', 'Kind of work', triage.answers.kind), risk]);
  const needsHuman = typeof risk.value === 'number' && risk.value >= HUMAN_REVIEW_RISK;

  let feedback = '';
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    enter('build', attempt);
    const build =
      (options.sloppy && attempt === 1 && replaySloppyPatch(ticket)) ||
      (await writeCode(ticket, await readSources(options.mainDir), feedback));
    const attemptDir = path.join(options.workDir, `${ticket.id}-${attempt}`);
    await cloneDir(options.mainDir, attemptDir);
    await applyEdits(attemptDir, build.edits);
    const diff = await diffDirs(options.mainDir, attemptDir);
    shift.emit({
      type: 'agent.output',
      ticketId: ticket.id,
      attempt,
      agent: build.agent,
      summary: build.summary,
      files: build.edits.map((edit) => edit.path),
      diff,
      latencyMs: build.latencyMs,
    });

    enter('tests', attempt);
    const tests = await runTests(attemptDir);
    shift.emit({ type: 'tests.result', ticketId: ticket.id, attempt, ...tests });
    if (!tests.passed) {
      feedback = `The tests failed:\n${tests.output}`;
      continue;
    }

    enter('gate', attempt);
    const gate = await decide(`${ticketState}\n\nDIFF:\n${diff}`, asQuestions(GATE_CHECKS));
    const verdicts = GATE_CHECKS.map((check) => judge(check, gate.answers[check.id]));
    record(shift, ticket, 'gate', attempt, gate, verdicts);
    const failed = verdicts.filter((v) => v.passed === false);
    if (failed.length > 0) {
      feedback = [
        'Capy rejected the diff below:',
        ...failed.map((v) => `- ${v.label} failed (${v.display})`),
        '',
        diff,
      ].join('\n');
      continue;
    }

    if (needsHuman) return finish(shift, ticket, 'escalated', attempt, 'Clean, but high risk: waiting for a human sign-off');
    await cloneDir(attemptDir, options.mainDir);
    return finish(shift, ticket, 'merged', attempt, 'Capy-approved');
  }
  finish(shift, ticket, 'escalated', config.maxAttempts, 'Out of attempts, so a human takes over');
}

function record(
  shift: Shift,
  ticket: Ticket,
  stage: Stage,
  attempt: number,
  result: Decisions<string>,
  decisions: Verdict[],
): void {
  shift.emit({
    type: 'jev.call',
    ticketId: ticket.id,
    stage,
    attempt,
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    model: result.model,
    decisions,
  });
}

function finish(shift: Shift, ticket: Ticket, outcome: Outcome, attempts: number, reason: string): void {
  shift.emit({ type: 'ticket.stage', ticketId: ticket.id, stage: outcome === 'merged' ? 'onsen' : outcome, attempt: attempts });
  shift.emit({ type: 'ticket.outcome', ticketId: ticket.id, outcome, attempts, reason });
}
