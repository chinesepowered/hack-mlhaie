import { config } from './config.ts';

/** A typed question for a System One model. */
export type Question =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

/** A typed answer: probabilities and labels, never prose. */
export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | {
      type: 'score';
      score: number;
      confidence: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
    };

export interface Decisions<K extends string> {
  model: string;
  answers: Record<K, Answer>;
  inputTokens: number;
  latencyMs: number;
  requestId: string | null;
}

export interface RawDecisions {
  model: string;
  answers?: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Ask Jev a batch of typed questions about one state. Jev answers the
 * questions in parallel, so a whole checklist costs a single round trip.
 */
export async function decide<K extends string>(
  state: string,
  questions: Record<K, Question>,
  fetchImpl: typeof fetch = fetch,
): Promise<Decisions<K>> {
  const started = performance.now();
  const response = await fetchImpl(`${config.jev.baseUrl}/v1/systemone`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.jev.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.jev.model, state, questions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Jev request failed (${response.status}): ${await response.text()}`);
  }
  const raw = (await response.json()) as RawDecisions;
  const ids = Object.keys(questions) as K[];
  return parseDecisions(raw, ids, performance.now() - started, response.headers.get('x-typesafe-request-id'));
}

export function parseDecisions<K extends string>(
  raw: RawDecisions,
  ids: readonly K[],
  latencyMs: number,
  requestId: string | null,
): Decisions<K> {
  const answers = {} as Record<K, Answer>;
  for (const id of ids) {
    const answer = raw.answers?.[id];
    if (!answer) throw new Error(`Jev response has no answer for "${id}"`);
    answers[id] = answer;
  }
  return {
    model: raw.model,
    answers,
    inputTokens: raw.usage?.input_tokens ?? 0,
    latencyMs: Math.round(latencyMs),
    requestId,
  };
}

export function jevCostUsd(inputTokens: number): number {
  return (inputTokens / 1_000_000) * config.jev.usdPerMillionInputTokens;
}
