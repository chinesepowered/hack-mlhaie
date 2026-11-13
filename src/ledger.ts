import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Verdict } from './checks.ts';
import { jevCostUsd } from './jev.ts';

export type Stage = 'intake' | 'triage' | 'build' | 'tests' | 'gate' | 'onsen' | 'bounced' | 'escalated';
export type Outcome = 'merged' | 'bounced' | 'escalated';

export interface TicketInfo {
  id: string;
  title: string;
  body: string;
}

export type ShiftEvent =
  | {
      type: 'run.start';
      runId: string;
      mode: 'live' | 'replay';
      models: { system1: string; system2: string };
      tickets: TicketInfo[];
    }
  | { type: 'ticket.stage'; ticketId: string; stage: Stage; attempt: number }
  | {
      type: 'jev.call';
      ticketId: string;
      stage: Stage;
      attempt: number;
      latencyMs: number;
      inputTokens: number;
      model: string;
      decisions: Verdict[];
    }
  | {
      type: 'agent.output';
      ticketId: string;
      attempt: number;
      agent: 'qwen' | 'sloppy';
      summary: string;
      files: string[];
      diff: string;
      latencyMs: number;
    }
  | { type: 'tests.result'; ticketId: string; attempt: number; passed: boolean; summary: string; output: string }
  | { type: 'ticket.outcome'; ticketId: string; outcome: Outcome; attempts: number; reason: string }
  | { type: 'run.end'; totals: Totals }
  | { type: 'log'; level: 'info' | 'error'; message: string };

/** An event plus `t`, milliseconds since the shift started. */
export type TimedEvent = ShiftEvent & { t: number };

export interface Totals {
  jevRequests: number;
  decisions: number;
  jevMsAvg: number;
  jevInputTokens: number;
  jevCostUsd: number;
  llmMsTotal: number;
  merged: number;
  bounced: number;
  escalated: number;
  /** Gate calls that sent an attempt back because a check failed. */
  slopCaught: number;
}

/** A saved shift: summary up top, the full event log below (used for replay and the video). */
export interface ShiftRecord {
  runId: string;
  startedAt: string;
  models: { system1: string; system2: string };
  tickets: { id: string; title: string; outcome: Outcome | 'unfinished'; attempts: number }[];
  totals: Totals;
  highlight: { ticketId: string; title: string; failed: { label: string; display: string }[] } | null;
  events: TimedEvent[];
}

type Listener = (event: TimedEvent) => void;

/** One factory shift: an append-only event log that listeners can follow live. */
export class Shift {
  readonly events: TimedEvent[] = [];
  readonly startedAt = new Date();
  private readonly listeners = new Set<Listener>();

  constructor(readonly id: string) {}

  emit(event: ShiftEvent): void {
    this.push({ ...event, t: Date.now() - this.startedAt.getTime() });
  }

  /** Append an already-timed event, e.g. while replaying a recorded shift. */
  push(event: TimedEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function computeTotals(events: readonly TimedEvent[]): Totals {
  const calls = events.filter((e) => e.type === 'jev.call');
  const builds = events.filter((e) => e.type === 'agent.output');
  const outcomes = events.filter((e) => e.type === 'ticket.outcome');
  const jevInputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0);
  const count = (outcome: Outcome) => outcomes.filter((e) => e.outcome === outcome).length;
  return {
    jevRequests: calls.length,
    decisions: calls.reduce((sum, call) => sum + call.decisions.length, 0),
    jevMsAvg: calls.length ? Math.round(calls.reduce((sum, call) => sum + call.latencyMs, 0) / calls.length) : 0,
    jevInputTokens,
    jevCostUsd: jevCostUsd(jevInputTokens),
    llmMsTotal: builds.reduce((sum, build) => sum + build.latencyMs, 0),
    merged: count('merged'),
    bounced: count('bounced'),
    escalated: count('escalated'),
    slopCaught: calls.filter((call) => call.stage === 'gate' && call.decisions.some((d) => d.passed === false)).length,
  };
}

export function toRecord(shift: Shift): ShiftRecord {
  const start = shift.events.find((e) => e.type === 'run.start');
  const tickets = start?.type === 'run.start' ? start.tickets : [];
  const outcomes = new Map(
    shift.events.flatMap((e) => (e.type === 'ticket.outcome' ? [[e.ticketId, e] as const] : [])),
  );
  const firstRejection = shift.events.find(
    (e) => e.type === 'jev.call' && e.stage === 'gate' && e.decisions.some((d) => d.passed === false),
  );
  return {
    runId: shift.id,
    startedAt: shift.startedAt.toISOString(),
    models: start?.type === 'run.start' ? start.models : { system1: '', system2: '' },
    tickets: tickets.map(({ id, title }) => ({
      id,
      title,
      outcome: outcomes.get(id)?.outcome ?? 'unfinished',
      attempts: outcomes.get(id)?.attempts ?? 0,
    })),
    totals: computeTotals(shift.events),
    highlight:
      firstRejection?.type === 'jev.call'
        ? {
            ticketId: firstRejection.ticketId,
            title: tickets.find((t) => t.id === firstRejection.ticketId)?.title ?? '',
            failed: firstRejection.decisions
              .filter((d) => d.passed === false)
              .map(({ label, display }) => ({ label, display })),
          }
        : null,
    events: shift.events,
  };
}

export async function saveRecord(record: ShiftRecord, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
}

export async function loadRecord(file: string): Promise<ShiftRecord> {
  return JSON.parse(await readFile(file, 'utf8')) as ShiftRecord;
}
