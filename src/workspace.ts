import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
/** Absolute tsx loader, so tests run from any workspace folder. */
const TSX_LOADER = import.meta.resolve('tsx');

/** A complete replacement for one file, relative to the workspace root. */
export interface FileEdit {
  path: string;
  content: string;
}

export interface TestResult {
  passed: boolean;
  summary: string;
  output: string;
}

/** Agents may only touch TypeScript files under src/ and test/. */
const EDITABLE_PATH = /^(src|test)\/[\w-]+(\.test)?\.ts$/;

export function assertEditable(filePath: string): void {
  if (!EDITABLE_PATH.test(filePath)) {
    throw new Error(`Agents may only write src/*.ts or test/*.test.ts, not "${filePath}"`);
  }
}

export async function cloneDir(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

/** Every source and test file in the workspace, for the agent's context. */
export async function readSources(dir: string): Promise<FileEdit[]> {
  const files: FileEdit[] = [];
  for (const folder of ['src', 'test']) {
    const names = await readdir(path.join(dir, folder)).catch(() => [] as string[]);
    for (const name of names.filter((n) => n.endsWith('.ts')).sort()) {
      const relative = `${folder}/${name}`;
      files.push({ path: relative, content: await readFile(path.join(dir, relative), 'utf8') });
    }
  }
  return files;
}

export async function applyEdits(dir: string, edits: readonly FileEdit[]): Promise<void> {
  for (const edit of edits) assertEditable(edit.path);
  for (const edit of edits) {
    const target = path.join(dir, edit.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, edit.content.endsWith('\n') ? edit.content : `${edit.content}\n`);
  }
}

/** Unified diff between two workspaces, with paths relative to the workspace root. */
export async function diffDirs(before: string, after: string): Promise<string> {
  const cwd = path.dirname(before);
  const from = path.basename(before);
  const to = path.relative(cwd, after);
  try {
    await run('git', ['diff', '--no-index', '--no-color', '--', from, to], { cwd });
    return '';
  } catch (error) {
    const { code, stdout } = error as { code?: number; stdout?: string };
    if (code !== 1 || stdout === undefined) throw error;
    return stdout.replaceAll(`a/${from}/`, 'a/').replaceAll(`b/${to}/`, 'b/');
  }
}

/** Run the workspace's tests with Node's built-in test runner. */
export async function runTests(dir: string): Promise<TestResult> {
  try {
    const args = ['--import', TSX_LOADER, '--test', '--test-reporter=spec', 'test/*.test.ts'];
    // Drop the parent's test-runner context so the child prints its own report.
    const { NODE_TEST_CONTEXT: _parentContext, ...env } = process.env;
    const { stdout, stderr } = await run(process.execPath, args, { cwd: dir, env, timeout: 60_000 });
    return { passed: true, summary: summarize(stdout), output: tail(`${stdout}${stderr}`) };
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    return { passed: false, summary: summarize(stdout) || 'tests did not run', output: tail(`${stdout}${stderr}`) };
  }
}

function summarize(output: string): string {
  const count = (label: string) => output.match(new RegExp(`^[ℹ#] ${label} (\\d+)`, 'm'))?.[1];
  const [pass, fail] = [count('pass'), count('fail')];
  return pass === undefined ? '' : `${pass} passed, ${fail ?? '0'} failed`;
}

function tail(text: string, lines = 40): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}
