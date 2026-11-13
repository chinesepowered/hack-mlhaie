import type { Answer, Question } from './jev.ts';

/** A yes/no question where one of the answers means "this is slop". */
export interface Check {
  id: string;
  label: string;
  instructions: string;
  /** The answer that fails the check. */
  failWhen: 'yes' | 'no';
  /** Cut-off on P(yes): at or above it the answer counts as "yes". */
  threshold: number;
}

/** One recorded decision, as shown on the dashboard and in the PR ledger. */
export interface Verdict {
  id: string;
  label: string;
  type: Answer['type'];
  value: number | string;
  display: string;
  threshold: number | null;
  /** null for informational answers such as the triage category. */
  passed: boolean | null;
}

/** Intake: Capy refuses to start work on a ticket nobody could build. */
export const INTAKE_CHECKS: readonly Check[] = [
  {
    id: 'specific',
    label: 'Specific enough to build',
    instructions:
      'Could a developer implement and test this ticket without asking any clarifying questions? A buildable ticket names the exact behavior, the inputs and the expected results.',
    failWhen: 'no',
    threshold: 0.5,
  },
];

/** Gate: the anti-slop checklist every diff must pass, after the tests. */
export const GATE_CHECKS: readonly Check[] = [
  {
    id: 'placeholders',
    label: 'No TODOs or placeholders',
    instructions:
      'Does the diff add TODO or FIXME comments, stubs, placeholder logic or unfinished branches?',
    failWhen: 'yes',
    threshold: 0.5,
  },
  {
    id: 'debris',
    label: 'No debug logs or dead code',
    instructions: 'Does the diff add console.log debugging output or commented-out code?',
    failWhen: 'yes',
    threshold: 0.5,
  },
  {
    id: 'types',
    label: 'Precise types',
    instructions: 'Does the diff weaken type safety, for example with `any`, unchecked casts or overly broad types?',
    failWhen: 'yes',
    threshold: 0.5,
  },
  {
    id: 'scope',
    label: 'Stays within the ticket',
    instructions: 'Does the diff change code or behavior that the ticket did not ask for?',
    failWhen: 'yes',
    threshold: 0.5,
  },
  {
    id: 'tests',
    label: 'Tests assert the new behavior',
    instructions:
      'Do the tests in this diff assert exact expected values for the behavior the ticket asks for, including the edge cases the ticket lists?',
    failWhen: 'no',
    threshold: 0.5,
  },
];

/** Triage: what kind of work, and how risky is it to ship unreviewed? */
export const TRIAGE_QUESTIONS = {
  kind: {
    type: 'choice',
    instructions: 'What kind of work does this ticket ask for?',
    criteria: {
      feature: 'Adds new behavior',
      bug: 'Fixes existing behavior that is wrong',
      refactor: 'Restructures code without changing behavior',
      docs: 'Documentation or comments only',
    },
  },
  risk: {
    type: 'score',
    instructions: 'How risky would it be to ship this change without a human reviewing it?',
    criteria: ['Low', 'Medium', 'High'],
  },
} as const satisfies Record<string, Question>;

/** Risk score (0 = Low … 2 = High) at which a passing change still waits for a human. */
export const HUMAN_REVIEW_RISK = 1.5;

export function asQuestions(checks: readonly Check[]): Record<string, Question> {
  return Object.fromEntries(checks.map((check) => [check.id, { type: 'noul', instructions: check.instructions }]));
}

export function judge(check: Check, answer: Answer | undefined): Verdict {
  if (answer?.type !== 'noul') throw new Error(`Check "${check.id}" needs a yes/no answer`);
  const pYes = answer.noul;
  const saidYes = pYes >= check.threshold;
  return {
    id: check.id,
    label: check.label,
    type: 'noul',
    value: pYes,
    display: `P(yes) ${pYes.toFixed(2)}`,
    threshold: check.threshold,
    passed: check.failWhen === 'yes' ? !saidYes : saidYes,
  };
}

/** Record an informational answer (no pass/fail). */
export function describeAnswer(id: string, label: string, answer: Answer | undefined): Verdict {
  if (!answer) throw new Error(`Missing answer for "${id}"`);
  const base = { id, label, threshold: null, passed: null };
  switch (answer.type) {
    case 'choice':
      return { ...base, type: 'choice', value: answer.choice, display: `${answer.choice} (${answer.confidence.toFixed(2)})` };
    case 'score': {
      const level = answer.legend[String(Math.round(answer.score))] ?? '';
      return { ...base, type: 'score', value: answer.score, display: `${level} (${answer.score.toFixed(2)})` };
    }
    case 'noul':
      return { ...base, type: 'noul', value: answer.noul, display: `P(yes) ${answer.noul.toFixed(2)}` };
  }
}
