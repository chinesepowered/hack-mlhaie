// Builds the HyperFrames composition for the CapyWorks demo video.
//
// Inputs
//   ../runs/demo.json          real factory run (falls back to data/mock-run.json)
//   narration.json + audio/    ElevenLabs narration clips and their character timings
//   ../assets/capy.svg         the mascot, inlined so each scene can pose it
//   index.html.tmpl            the composition, with {{PLACEHOLDERS}}
// Outputs
//   index.html                 the composition HyperFrames renders
//   data.js                    run data, scene timings, word cues and captions
//
// Usage (from video/): node build.mjs && npx hyperframes render --output out/capyworks-demo.mp4
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

const LEAD_S = 0.5; // silence before each scene's narration
const TAIL_S = 0.8; // breathing room after it
const LAST_TAIL_S = 1.8;
const MAX_WORDS_PER_CAPTION = 7;

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const round = (n) => Math.round(n * 1000) / 1000;

function loadRun() {
  const real = path.join(repo, "runs", "demo.json");
  if (existsSync(real)) return { run: readJson(real), source: "runs/demo.json" };
  console.warn("! runs/demo.json not found, using data/mock-run.json");
  return { run: readJson(path.join(here, "data", "mock-run.json")), source: "mock" };
}

function audioSeconds(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

/** Turns ElevenLabs character timings into words with start/end seconds. */
function wordsFrom(alignment) {
  const words = [];
  let word = null;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (word) words.push(word);
      word = null;
      return;
    }
    word ??= { text: "", start: alignment.character_start_times_seconds[i], end: 0 };
    word.text += ch;
    word.end = alignment.character_end_times_seconds[i];
  });
  if (word) words.push(word);
  return words;
}

const cueKey = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

function buildTimeline(narration) {
  const scenes = [];
  const captions = [];
  const cues = {};
  let cursor = 0;

  narration.forEach((scene, index) => {
    const voSeconds = audioSeconds(path.join(here, "audio", `${scene.id}.mp3`));
    const tail = index === narration.length - 1 ? LAST_TAIL_S : TAIL_S;
    const start = cursor;
    const voStart = start + LEAD_S;
    const duration = LEAD_S + voSeconds + tail;
    scenes.push({ id: scene.id, start: round(start), duration: round(duration), voStart: round(voStart), voSeconds: round(voSeconds) });

    const words = wordsFrom(readJson(path.join(here, "audio", `${scene.id}.alignment.json`)));
    cues[scene.id] = {};
    for (const word of words) {
      const key = cueKey(word.text);
      if (key && cues[scene.id][key] === undefined) cues[scene.id][key] = round(voStart + word.start);
    }

    let phrase = [];
    const flush = () => {
      if (!phrase.length) return;
      captions.push({
        text: phrase.map((w) => w.text).join(" "),
        start: round(voStart + phrase[0].start),
        end: round(voStart + phrase.at(-1).end),
      });
      phrase = [];
    };
    for (const word of words) {
      phrase.push(word);
      if (/[.,:;!?]$/.test(word.text) || phrase.length >= MAX_WORDS_PER_CAPTION) flush();
    }
    flush();
    cursor += duration;
  });

  // Hold each caption until the next one when the gap is short, so text doesn't flicker.
  captions.forEach((caption, i) => {
    const next = captions[i + 1];
    caption.end = round(next && next.start - caption.end < 0.6 ? next.start : caption.end + 0.35);
  });

  return { scenes, captions, cues, total: round(cursor) };
}

/** Inlines the mascot with a unique id and no duplicate inner ids. */
function capy(id, extraClass = "") {
  const svg = readFileSync(path.join(repo, "assets", "capy.svg"), "utf8");
  const classes = ["capy", "vcapy", extraClass].filter(Boolean).join(" ");
  return svg.replace(/ id="capy-[a-z-]+"/g, "").replace('class="capy"', `id="${id}" class="${classes}"`);
}

/**
 * Pulls the highlighted ticket's story out of the run's event log: its triage answers, the gate
 * call that bounced it (with P(fail) per check, since each check's question has its own polarity),
 * the tests that passed anyway, and the gate call that let the retry through.
 */
function storyFrom(run) {
  const ticketId = run.highlight?.ticketId;
  const events = (run.events ?? []).filter((e) => e.ticketId === ticketId);
  if (!ticketId || !events.length) return null;
  const jev = (stage) => events.filter((e) => e.type === "jev.call" && e.stage === stage);
  const failingGate = jev("gate").find((call) => call.decisions.some((d) => d.passed === false));
  const passingGate = jev("gate").find((call) => call.decisions.every((d) => d.passed !== false));
  const testsFor = (attempt) => events.find((e) => e.type === "tests.result" && e.attempt === attempt);
  const failP = (d) => (typeof d.value === "number" && typeof d.threshold === "number" ? (d.value >= d.threshold ? d.value : 1 - d.value) : null);
  return {
    ticketId,
    title: run.highlight.title,
    triage: jev("triage").flatMap((call) => call.decisions).map(({ label, type, display, value }) => ({ label, type, display, value })),
    bounced: failingGate && {
      attempt: failingGate.attempt,
      latencyMs: failingGate.latencyMs,
      tests: testsFor(failingGate.attempt)?.summary ?? null,
      checks: failingGate.decisions.filter((d) => d.passed === false).map((d) => ({ id: d.id, label: d.label, value: d.value, failP: round(failP(d)) })),
    },
    merged: passingGate && { attempt: passingGate.attempt, latencyMs: passingGate.latencyMs, checks: passingGate.decisions.length },
  };
}

const { run, source } = loadRun();
const story = storyFrom(run);
delete run.events; // the video only needs the summary and the story
const { scenes: narration } = readJson(path.join(here, "narration.json"));
const timeline = buildTimeline(narration);

for (const shot of ["floor", "reject", "merged"]) {
  if (!existsSync(path.join(here, "assets", "screens", `${shot}.png`))) throw new Error(`missing assets/screens/${shot}.png`);
}

const audio = timeline.scenes
  .map((s) => `<audio id="vo-${s.id}" src="./audio/${s.id}.mp3" data-start="${s.voStart}" data-duration="${s.voSeconds}" data-track-index="9"></audio>`)
  .join("\n  ");

let html = readFileSync(path.join(here, "index.html.tmpl"), "utf8")
  .replaceAll("{{TOTAL}}", String(timeline.total))
  .replace("{{AUDIO}}", audio);
html = html.replace(/\{\{CAPY:([a-z-]+)(?::([a-z- ]+))?\}\}/g, (_, id, cls) => capy(id, cls ?? ""));

writeFileSync(path.join(here, "index.html"), html);
writeFileSync(
  path.join(here, "data.js"),
  `// Generated by build.mjs — do not edit.\nwindow.CAPY = ${JSON.stringify({ run, story, source, ...timeline }, null, 2)};\n`,
);
console.log(`built index.html (${timeline.total}s, ${timeline.captions.length} captions) from ${source}`);
