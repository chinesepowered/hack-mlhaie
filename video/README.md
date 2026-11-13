# CapyWorks demo video

An 80-second demo of CapyWorks, written as HTML and rendered to MP4 with
[HeyGen HyperFrames](https://github.com/heygen-com/hyperframes). Capy narrates
it with an ElevenLabs voice ("Jessica").

```bash
bash video/scripts/render.sh        # build + lint + render → video/out/capyworks-demo.mp4
```

| File | What it is |
| - | - |
| `index.html.tmpl` | The composition: seven scenes, captions and a GSAP timeline HyperFrames can seek |
| `build.mjs` | Fills the template with run data from `../runs/demo.json` and narration timings, writes `index.html` + `data.js` |
| `narration.json` | Capy's lines, one per scene. Numbers stay on screen, not in the voice, so new runs never need new audio |
| `scripts/voice.mjs` | Generates `audio/<scene>.mp3` plus word timings with ElevenLabs (needs `ELEVENLABS_API_KEY`) |
| `assets/screens/` | Dashboard screenshots shown in the floor and gate scenes |
| `data/mock-run.json` | Fallback data when no real run exists |

Every number in the video comes from the run log: the gate's P(fail) values
are derived from Jev's raw P(yes) and each check's threshold, since some
checks ask about a defect and some about a good property.
