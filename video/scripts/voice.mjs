// Generates one narration clip per scene with ElevenLabs (with character timestamps).
// Skips scenes whose audio already exists; pass --force to regenerate.
// Usage (from video/): node scripts/voice.mjs [--force]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { voice, scenes } = JSON.parse(readFileSync(path.join(root, "narration.json"), "utf8"));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
const force = process.argv.includes("--force");

for (const [i, scene] of scenes.entries()) {
  const mp3 = path.join(root, "audio", `${scene.id}.mp3`);
  const json = path.join(root, "audio", `${scene.id}.alignment.json`);
  if (!force && existsSync(mp3) && existsSync(json)) {
    console.log(`skip ${scene.id} (exists)`);
    continue;
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: scene.text,
        model_id: voice.model,
        previous_text: scenes[i - 1]?.text,
        next_text: scenes[i + 1]?.text,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${scene.id}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  writeFileSync(mp3, Buffer.from(body.audio_base64, "base64"));
  writeFileSync(json, JSON.stringify(body.normalized_alignment ?? body.alignment));
  console.log(`wrote ${scene.id}`);
}
