import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { Ticket } from './agents.ts';
import { config, hasKeys } from './config.ts';
import { runShift } from './factory.ts';
import { Shift, loadRecord, saveRecord, toRecord, type TimedEvent } from './ledger.ts';

const STATIC_ROOTS = { '/assets/': path.resolve('assets'), '/video/': path.resolve('video/out'), '/': path.resolve('public') };
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
};
/** Replays keep the rhythm of a real shift but squeeze the long LLM waits. */
const REPLAY_MAX_GAP_MS = 4000;

let current: Shift | null = null;
let running = false;
const clients = new Set<ServerResponse>();

function broadcast(event: TimedEvent): void {
  for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
}

function begin(shift: Shift): void {
  current = shift;
  running = true;
  shift.subscribe(broadcast);
}

async function startLiveShift(sloppy: boolean): Promise<string> {
  const tickets = JSON.parse(await readFile('tickets/demo.json', 'utf8')) as Ticket[];
  const shift = new Shift(`shift-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  begin(shift);
  runShift(shift, { tickets, sloppy, targetDir: 'target', workDir: `.workspaces/${shift.id}` })
    .then(async () => {
      const record = toRecord(shift);
      await saveRecord(record, `runs/${shift.id}.json`);
      await saveRecord(record, 'runs/latest.json');
    })
    .catch((error: unknown) => shift.emit({ type: 'log', level: 'error', message: String(error) }))
    .finally(() => (running = false));
  return shift.id;
}

async function startReplay(runId: string): Promise<string> {
  const record = await loadRecord(`runs/${runId}.json`);
  const shift = new Shift(`${record.runId}-replay`);
  begin(shift);
  void (async () => {
    let previous = 0;
    for (const event of record.events) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(event.t - previous, REPLAY_MAX_GAP_MS)));
      previous = event.t;
      shift.push(event.type === 'run.start' ? { ...event, mode: 'replay' } : event);
    }
  })().finally(() => (running = false));
  return shift.id;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const [prefix, root] = Object.entries(STATIC_ROOTS).find(([p]) => pathname.startsWith(p)) ?? ['/', STATIC_ROOTS['/']];
  const relative = pathname.slice(prefix.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    for (const event of current?.events ?? []) res.write(`data: ${JSON.stringify(event)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (pathname === '/api/state') return json(res, 200, { running, runId: current?.id ?? null, hasKeys: hasKeys() });
  if (req.method === 'POST' && (pathname === '/api/run' || pathname === '/api/replay')) {
    if (running) return json(res, 409, { error: 'A shift is already running' });
    const body = await readJson(req);
    if (pathname === '/api/run') {
      if (!hasKeys()) return json(res, 400, { error: 'Live shifts need TYPESAFE_API_KEY and LLM_API_KEY' });
      return json(res, 200, { runId: await startLiveShift(body.sloppy === true) });
    }
    const runId = typeof body.runId === 'string' && /^[\w.-]+$/.test(body.runId) ? body.runId : 'demo';
    return json(res, 200, { runId: await startReplay(runId) });
  }
  return serveStatic(pathname, res);
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => json(res, 500, { error: String(error) }));
}).listen(config.port, () => {
  console.log(`CapyWorks is open at http://localhost:${config.port}`);
});
