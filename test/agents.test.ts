import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBuild, replaySloppyPatch } from '../src/agents.ts';

test('parseBuild reads the summary and complete files', () => {
  const reply = [
    'Some reasoning the model added.',
    '<summary>Add yuzuNeeded.</summary>',
    '<file path="src/yuzu.ts">',
    'export const x = 1;',
    '</file>',
    '<file path="test/yuzu.test.ts">',
    "import { x } from '../src/yuzu.ts';",
    '</file>',
  ].join('\n');

  assert.deepEqual(parseBuild(reply), {
    summary: 'Add yuzuNeeded.',
    edits: [
      { path: 'src/yuzu.ts', content: 'export const x = 1;\n' },
      { path: 'test/yuzu.test.ts', content: "import { x } from '../src/yuzu.ts';\n" },
    ],
  });
});

test('parseBuild refuses replies without files', () => {
  assert.throws(() => parseBuild('<summary>Nothing.</summary>'), /no <file> blocks/);
});

test('parseBuild refuses paths outside src/ and test/', () => {
  assert.throws(() => parseBuild('<file path="../.env">KEY=1</file>'), /may only write/);
  assert.throws(() => parseBuild('<file path="package.json">{}</file>'), /may only write/);
});

test('the sloppy agent only acts on tickets with a recorded patch', () => {
  assert.equal(replaySloppyPatch({ id: 'T', title: 't', body: 'b' }), null);
  const build = replaySloppyPatch({
    id: 'T',
    title: 't',
    body: 'b',
    sloppyPatch: { summary: 'slop', files: [{ path: 'src/a.ts', content: '// TODO' }] },
  });
  assert.equal(build?.agent, 'sloppy');
  assert.equal(build?.edits.length, 1);
});
