import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, jevCostUsd, parseDecisions, type RawDecisions } from '../src/jev.ts';

const reply: RawDecisions = {
  model: 'jev-1.14.0',
  answers: { refund: { type: 'noul', noul: 0.99 } },
  usage: { input_tokens: 392, output_tokens: 69 },
};

test('decide posts typed questions and returns typed answers with usage', async () => {
  let sent: { url: string; body: unknown } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify(reply), { headers: { 'x-typesafe-request-id': 'req_1' } });
  }) as typeof fetch;

  const result = await decide('Please refund me.', { refund: { type: 'noul', instructions: 'Refund?' } }, fakeFetch);

  assert.match(sent?.url ?? '', /\/v1\/systemone$/);
  assert.deepEqual((sent?.body as { questions: unknown }).questions, { refund: { type: 'noul', instructions: 'Refund?' } });
  assert.deepEqual(result.answers.refund, { type: 'noul', noul: 0.99 });
  assert.equal(result.inputTokens, 392);
  assert.equal(result.requestId, 'req_1');
});

test('decide surfaces API errors', async () => {
  const fakeFetch = (async () => new Response('nope', { status: 401 })) as typeof fetch;
  await assert.rejects(decide('x', { a: { type: 'noul', instructions: 'a?' } }, fakeFetch), /Jev request failed \(401\)/);
});

test('parseDecisions fails loudly when an answer is missing', () => {
  assert.throws(() => parseDecisions(reply, ['refund', 'topic'], 10, null), /no answer for "topic"/);
});

test('cost is billed on input tokens only', () => {
  assert.equal(jevCostUsd(1_000_000), 0.042);
});
