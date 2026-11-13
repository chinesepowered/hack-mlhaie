import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { applyEdits, assertEditable, cloneDir, diffDirs, readSources, runTests } from '../src/workspace.ts';

await mkdir('.workspaces', { recursive: true });
const scratch = await mkdtemp(path.join('.workspaces', 'test-'));
after(() => rm(scratch, { recursive: true, force: true }));

test('only src/*.ts and test/*.test.ts are editable', () => {
  assert.doesNotThrow(() => assertEditable('src/yuzu.ts'));
  assert.doesNotThrow(() => assertEditable('test/yuzu.test.ts'));
  for (const bad of ['../secrets.ts', 'src/../../x.ts', 'package.json', 'src/nested/a.ts', '.env']) {
    assert.throws(() => assertEditable(bad), /may only write/, bad);
  }
});

test('a workspace clone can be edited, diffed and tested', async () => {
  const main = path.join(scratch, 'main');
  const attempt = path.join(scratch, 'attempt');
  await cloneDir('target', main);
  await cloneDir(main, attempt);
  await applyEdits(attempt, [{ path: 'src/hello.ts', content: "export const hello = 'capy';" }]);

  const diff = await diffDirs(main, attempt);
  assert.match(diff, /^\+\+\+ b\/src\/hello\.ts$/m);
  assert.match(diff, /^\+export const hello = 'capy';$/m);
  assert.deepEqual(
    (await readSources(attempt)).map((file) => file.path),
    ['src/hello.ts', 'src/onsen.ts', 'test/onsen.test.ts'],
  );

  const result = await runTests(attempt);
  assert.equal(result.passed, true);
  assert.equal(result.summary, '3 passed, 0 failed');
});

test('identical workspaces have an empty diff', async () => {
  const a = path.join(scratch, 'same-a');
  const b = path.join(scratch, 'same-b');
  await cloneDir('target', a);
  await cloneDir('target', b);
  assert.equal(await diffDirs(a, b), '');
});
