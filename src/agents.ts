import { complete } from './llm.ts';
import { assertEditable, type FileEdit } from './workspace.ts';

export interface Ticket {
  id: string;
  title: string;
  body: string;
  /** A recorded sloppy patch. In demo mode the sloppy agent replays it so the rejection is deterministic. */
  sloppyPatch?: { summary: string; files: FileEdit[] };
}

export interface Build {
  agent: 'qwen' | 'sloppy';
  summary: string;
  edits: FileEdit[];
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are a careful senior TypeScript engineer working in a tiny repository.
Implement the ticket with the smallest clean change.

Rules:
- Only create or edit src/<name>.ts and test/<name>.test.ts files.
- Tests use node:test and node:assert/strict, import source files with a .ts extension, and assert exact expected values, including every edge case the ticket lists.
- No TODO or FIXME comments, no console.log, no commented-out code, no \`any\`, and no changes the ticket did not ask for.
- Match the existing style: 2-space indent, single quotes, a short JSDoc comment on each exported function.

Reply in exactly this format, giving the COMPLETE new content of every file you change:
<summary>One sentence describing the change.</summary>
<file path="src/example.ts">
...complete file content...
</file>`;

/** System 2: the LLM coding agent writes the change. */
export async function writeCode(ticket: Ticket, sources: readonly FileEdit[], feedback: string): Promise<Build> {
  const prompt = [
    `TICKET ${ticket.id}: ${ticket.title}`,
    ticket.body,
    '',
    'REPOSITORY FILES:',
    ...sources.map((file) => `<file path="${file.path}">\n${file.content}</file>`),
    feedback && `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix every point below:\n${feedback}`,
  ].join('\n');
  const completion = await complete([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);
  return { agent: 'qwen', ...parseBuild(completion.content), latencyMs: completion.latencyMs };
}

/** The demo's sloppy agent: replays the ticket's recorded sloppy patch, if it has one. */
export function replaySloppyPatch(ticket: Ticket): Build | null {
  if (!ticket.sloppyPatch) return null;
  return { agent: 'sloppy', summary: ticket.sloppyPatch.summary, edits: ticket.sloppyPatch.files, latencyMs: 0 };
}

export function parseBuild(reply: string): { summary: string; edits: FileEdit[] } {
  const summary = reply.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? '';
  const edits = [...reply.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)<\/file>/g)].map(([, path = '', content = '']) => ({
    path,
    content,
  }));
  if (edits.length === 0) throw new Error('Agent reply contained no <file> blocks');
  for (const edit of edits) assertEditable(edit.path);
  return { summary, edits };
}
