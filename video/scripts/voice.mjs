// Generates one narration clip per scene with ElevenLabs, with character timestamps for the captions.
// Tries the models in narration.json in order and uses the first that returns timestamps for every scene.
// Usage (from video/): node scripts/voice.mjs [--out <dir>]   (default: audio/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { voice, scenes } = JSON.parse(readFileSync(path.join(root, "narration.json"), "utf8"));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
const outFlag = process.argv.indexOf("--out");
const outDir = path.resolve(outFlag > -1 ? process.argv[outFlag + 1] : path.join(root, "audio"));
mkdirSync(outDir, { recursive: true });

async function speak(model, scene, i, stitch) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: scene.text,
        model_id: model,
        voice_settings: voice.settings,
        // Neighbouring lines keep the delivery continuous across clips, where the model supports it.
        ...(stitch && { previous_text: scenes[i - 1]?.text, next_text: scenes[i + 1]?.text }),
      }),
    },
  );
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const alignment = body.normalized_alignment ?? body.alignment;
  if (!alignment?.characters?.length) throw new Error(`${model} returned no timestamps`);
  return { audio: Buffer.from(body.audio_base64, "base64"), alignment };
}

async function speakWithModel(model) {
  const clips = [];
  for (const [i, scene] of scenes.entries()) {
    const clip = await speak(model, scene, i, true).catch(() => speak(model, scene, i, false));
    clips.push({ scene, ...clip });
  }
  return clips;
}

for (const model of voice.models) {
  try {
    const clips = await speakWithModel(model);
    for (const { scene, audio, alignment } of clips) {
      writeFileSync(path.join(outDir, `${scene.id}.mp3`), audio);
      writeFileSync(path.join(outDir, `${scene.id}.alignment.json`), JSON.stringify(alignment));
    }
    console.log(`wrote ${clips.length} clips with ${model} to ${outDir}`);
    process.exit(0);
  } catch (error) {
    console.warn(`skipping ${model}: ${error.message}`);
  }
}
throw new Error("No model produced narration with timestamps");
