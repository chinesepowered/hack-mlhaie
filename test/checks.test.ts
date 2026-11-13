import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATE_CHECKS, asQuestions, describeAnswer, judge, type Check } from '../src/checks.ts';

const failOnYes: Check = { id: 'todo', label: 'No TODOs', instructions: 'Any TODOs?', failWhen: 'yes', threshold: 0.5 };
const failOnNo: Check = { id: 'tests', label: 'Has tests', instructions: 'Tests?', failWhen: 'no', threshold: 0.5 };

test('a "fail when yes" check fails at or above the threshold', () => {
  assert.equal(judge(failOnYes, { type: 'noul', noul: 0.5 }).passed, false);
  assert.equal(judge(failOnYes, { type: 'noul', noul: 0.49 }).passed, true);
});

test('a "fail when no" check passes at or above the threshold', () => {
  assert.equal(judge(failOnNo, { type: 'noul', noul: 0.86 }).passed, true);
  assert.equal(judge(failOnNo, { type: 'noul', noul: 0.01 }).passed, false);
});

test('judge records the probability, display text and threshold', () => {
  assert.deepEqual(judge(failOnYes, { type: 'noul', noul: 0.98 }), {
    id: 'todo',
    label: 'No TODOs',
    type: 'noul',
    value: 0.98,
    display: 'P(yes) 0.98',
    threshold: 0.5,
    passed: false,
  });
});

test('judge rejects a missing or non yes/no answer', () => {
  assert.throws(() => judge(failOnYes, undefined), /needs a yes\/no answer/);
  assert.throws(
    () => judge(failOnYes, { type: 'choice', choice: 'a', confidence: 1, probabilities: { a: 1 } }),
    /needs a yes\/no answer/,
  );
});

test('describeAnswer labels score answers with the nearest level', () => {
  const verdict = describeAnswer('risk', 'Risk', {
    type: 'score',
    score: 0.12,
    confidence: 0.9,
    legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
    probabilities: { '0': 0.9, '1': 0.08, '2': 0.02 },
  });
  assert.equal(verdict.display, 'Low (0.12)');
  assert.equal(verdict.passed, null);
});

test('every gate check becomes one yes/no question with the same id', () => {
  const questions = asQuestions(GATE_CHECKS);
  assert.deepEqual(Object.keys(questions), GATE_CHECKS.map((check) => check.id));
  assert.ok(Object.values(questions).every((question) => question.type === 'noul'));
});
