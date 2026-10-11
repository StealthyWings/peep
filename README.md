# peep: spot birds, not screens

**Hacktoberfest 2026 · Week 1 · "Touch Grass"**

peep turns a walk outside into a bird hunt. Point your phone at a bird (or just
*listen*), and two **open-weight AI models running on your phone** tell you what
it is, with a cool fact about it. You collect stickers for new species, new
places and dawn walks, share a card to Instagram or WhatsApp, and bird together
with family and friends in a private "flock".

It works deep in a forest with zero signal. It costs nothing to run. Your
location and recordings never leave your phone.

| Snap or listen | Get the bird + a cool fact | Earn stickers | Bird with your flock |
|---|---|---|---|
| Photo ID (964 species) and Song ID (6,500+ species) | Offline field guide built from Wikipedia | 10 / 25 / 50 / 100 species, Early Bird, Wanderer… | Swipe through friends' finds, weekly group goal, leaderboard |

---

## Open AI at the core

Every identification runs **on the device**. There's no inference API anywhere in this project.

| What | Open piece | License | Runs on |
|---|---|---|---|
| Photo ID | [Google AIY Birds V1](https://www.kaggle.com/models/google/aiy/tfLite/vision-classifier-birds-v1) image classifier (964 species) | Apache-2.0 | MediaPipe Tasks (WASM) in the browser |
| Song ID | [BirdNET](https://github.com/birdnet-team/BirdNET-Analyzer) V2.4 (6,522 classes: birds, frogs, insects…) | CC BY-SA 4.0 | TensorFlow.js (WebGL) in a Web Worker |
| "Is that bird even found here?" | BirdNET's geo/season meta-model | CC BY-SA 4.0 | TensorFlow.js, on-device |
| Runtimes | [MediaPipe](https://github.com/google-ai-edge/mediapipe), [TensorFlow.js](https://github.com/tensorflow/tfjs) | Apache-2.0 | Browser |
| Field guide text | Wikipedia intros, fetched at build time | CC BY-SA 4.0 | Bundled JSON (works offline) |
| Cool facts | [Gemma 3](https://ai.google.dev/gemma) via [Ollama](https://ollama.com), rewriting each intro into one grounded fact | Gemma terms | Your laptop, at build time (`npm run facts`) |
| Flock backend | `server/index.mjs`, Node + built-in SQLite, zero dependencies | MIT | Your laptop, a Raspberry Pi, any $0 host |

### Why open matters here (and where it beat closed)

- **It works on the trail with no signal.** Birds live where cell coverage doesn't. A
  cloud vision API is useless 2 km into a forest; peep's "trail pack" (63 MB, once)
  keeps both models on the phone. The app shell is a PWA with a service worker, so
  the whole thing opens and runs in airplane mode.
- **Your data stays yours.** Recordings, photos and GPS are processed on the device.
  Location only feeds the on-device BirdNET geo model, which re-ranks species by
  what actually lives near you this week, and it's never sent anywhere. The flock
  server only ever sees species names and timestamps, plus a photo when you opt in
  for that one sighting. Rare-bird locations can't leak because they never leave the phone.
- **It costs nothing to run.** No per-photo API bill means no reason to ration
  identifications or put them behind a login. A family can run their own flock
  server on an old laptop.
- **You can see and change how it behaves.** We tuned things a closed API won't let you touch:
  - *multi-crop inference* (whole frame + tighter crops, or crops around where you
    tap) so tiny birds in phone photos still get identified;
  - *log-mean-exp pooling* across 3-second windows so one clear chirp in a noisy
    recording still counts;
  - a *location prior* that demotes "unusual here" species instead of hiding
    them, so vagrants can still be logged.
- **You can swap models.** AIY Birds is strongest on North American and European
  birds. Because it's just a `.tflite` file, a contributor can drop in a regional
  model (e.g. one fine-tuned on Indian birds) without touching the UI. See
  [Ideas for contributors](#ideas-for-contributors).

### Designed to keep the screen time short

- **Snap → confirm → "Back outside".** The camera button opens the phone's own
  camera, and logging takes one tap.
- **Listening is eyes-up time.** While BirdNET records, the screen tells you to look up.
- **Hands-free mode.** The phone buzzes when it's done listening and says the bird's
  name, how sure it is and a fun fact out loud, using the phone's own offline voice.
  You never have to look down.
- **The flock feed ends.** You swipe through what's new since your last visit, then
  get a "You're all caught up — the rest is outside" card. There's no infinite scroll.
- **Stickers reward the outdoors, not the app:** unique species (photographing the
  same pigeon 100× earns nothing), birding on 7 different days, 5 different places,
  before 7 am, both days of a weekend.
- **The group challenge is a shared outdoor goal:** "spot 15 species together this week".

---

## Run it

Requires **Node 22.13+** (for the built-in SQLite).

```bash
npm install
npm run setup          # downloads the open models (~63 MB) into public/
npm run dev            # app on :5173 + flock server on :8787
```

Open http://localhost:5173. To try it on your phone, open the "Network" URL Vite
prints. Note that the camera and microphone need HTTPS outside localhost, so use
the production build behind HTTPS (any tunnel or host works).

**Production (one process serves the app + API):**

```bash
npm start              # builds, then serves dist/ and /api on :8787
```

Environment: `PORT` (default 8787), `PEEP_DB` (SQLite path, default `server/peep.db`).
To host the app and the flock server on different origins, build with
`VITE_FLOCK_URL=https://your-flock-server`.

**Rebuild the field guide** (already included in `public/data/species.json`):

```bash
WIKI_CONTACT="https://github.com/you/peep" npm run build:species
```

**Better facts with Gemma** (optional, runs locally on your GPU or CPU):

```bash
ollama pull gemma3:4b
npm run facts          # resumable; photo-model species first. Add --limit 200 to try it
```

Gemma reads the numbered sentences of each species' Wikipedia intro, picks the
one a walker would find most surprising, and condenses it. Its answer is only
used if it passes checks: every meaningful word and number must appear in the
source text (so nothing invented gets through), it must be family-friendly,
and it can't be a dull range/taxonomy/plumage line. Otherwise the original
sentence is kept. In testing about a third of species got a Gemma fact, e.g.
"It is believed the male kori bustard may be the heaviest living animal capable of flight."

On a CPU this runs at roughly 7–8 species a minute; a CUDA GPU is much faster.
The cache in `scripts/.cache/gemma-facts.json` means you can stop and resume.
If you rebuild the guide with `npm run build:species`, run `npm run facts` again
to re-apply the cached Gemma facts (instant).

## Deploy

- **Render:** New → Blueprint → this repo. `render.yaml` builds the app, downloads the
  models and starts the Flock server. The free plan resets the database on every
  restart; use the starter plan with the disk in `render.yaml` to keep flocks.
- **DigitalOcean App Platform** (or any Node host): build command
  `npm ci && npm run setup && npm run build`, run command `node server/index.mjs`,
  and Node 22.13 or newer. You get HTTPS, which phones need for the camera and microphone.
- **CI:** `.github/workflows/ci.yml` typechecks, lints, builds and smoke-tests the Flock API on every push.

## How it works

```
    photo ──► MediaPipe + AIY Birds (.tflite) ──┐
                                                 ├─► rank ◄── BirdNET geo model (lat, lon, week) ◄── GPS (on-device only)
    audio ──► 48 kHz mono ──► BirdNET (TF.js) ──┘      │
                                                         ▼
                                         offline field guide (name, summary, cool fact)
                                                         │
                         IndexedDB (your sightings) ◄────┤────► share card (canvas → PNG → share sheet)
                                   │
                                   └── when online ──► Flock server (species + time, opt-in photo)
```

| Path | What's there |
|---|---|
| `src/lib/photoId.ts` | MediaPipe image classifier, multi-crop / tap-to-focus |
| `src/lib/birdnet.worker.ts` | BirdNET + geo model in a Web Worker (WebGL STFT kernel) |
| `src/lib/stickers.ts` | Sticker rules |
| `src/lib/shareCard.ts` | 1080×1350 share-card renderer |
| `src/lib/offline.ts`, `public/sw.js` | Trail pack + service worker |
| `server/index.mjs` | Flock API (register, flocks, feed, leaderboard, weekly challenge) |
| `scripts/` | Model download + field guide builder |

## Ideas for contributors

Good first issues for Hacktoberfest:

- **Regional photo models.** Add a model picker and a model trained on birds of
  India, Africa or South America, for example.
- **Localised names.** BirdNET ships labels in 27 languages (`labels/*.txt`); wire up a language setting.
- **Gemma in the app.** Run Gemma in the browser (MediaPipe LLM Inference) for an offline "ask about this bird" mode.
- **Live listening mode.** Continuous BirdNET with a gentle vibration when a new species sings.
- **More stickers.** Seasonal migrants, "5 birds of prey", Big Day (20 species in one day)…
- Accessibility and translation passes.

## Credits & licenses

- Code: MIT (see `LICENSE`).
- BirdNET models: © K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of
  Ornithology & Chemnitz University of Technology, **CC BY-SA 4.0**. TF.js port and
  worker code adapted from [birdnet-team/real-time-pwa](https://github.com/birdnet-team/real-time-pwa)
  (MIT) and [georg95/birdnet-web](https://github.com/georg95/birdnet-web).
  Kahl, S. et al. (2021). *BirdNET: A deep learning solution for avian diversity monitoring.* Ecological Informatics 61.
- AIY Birds V1: Google, Apache-2.0.
- Field guide text and thumbnails: Wikipedia / Wikimedia Commons contributors, CC BY-SA 4.0.
