// Downloads the open-weight models Peep runs on-device and copies the
// MediaPipe WASM runtime into /public so everything can be served (and
// cached for offline use) from our own origin.
//
//   node scripts/fetch-models.mjs          # skip files that already exist
//   node scripts/fetch-models.mjs --force  # re-download everything

import { mkdir, writeFile, access, cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const FORCE = process.argv.includes('--force')

// Google AIY "Birds V1" image classifier (Apache-2.0), 964 species.
// The TFLite file embeds metadata with the label list, which MediaPipe reads.
const AIY_URL =
  'https://tfhub.dev/google/lite-model/aiy/vision/classifier/birds_V1/3?lite-format=tflite'

// BirdNET (K. Lisa Yang Center for Conservation Bioacoustics), TF.js port
// published by the BirdNET team. Models: CC BY-SA 4.0. Pinned to a commit so
// the weights never change underneath us.
const BIRDNET_COMMIT = '6ab67ac09fa64d98858b90f14318229aca9bb7dc'
const BIRDNET_BASE = `https://raw.githubusercontent.com/birdnet-team/real-time-pwa/${BIRDNET_COMMIT}/public/models/birdnet`
const BIRDNET_FILES = [
  'model.json',
  ...Array.from({ length: 13 }, (_, i) => `group1-shard${i + 1}of13.bin`),
  'area-model/model.json',
  'area-model/group1-shard1of2.bin',
  'area-model/group1-shard2of2.bin',
  'labels/en_us.txt',
]

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function download(url, dest) {
  if (!FORCE && (await exists(dest))) {
    console.log(`  ✓ ${dest.replace(ROOT, '.')} (cached)`)
    return
  }
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  console.log(`  ↓ ${dest.replace(ROOT, '.')} (${(buf.length / 1e6).toFixed(1)} MB)`)
}

console.log('Photo model: Google AIY Birds V1')
await download(AIY_URL, join(PUBLIC, 'models/aiy-birds/birds_V1.tflite'))

console.log('Sound model: BirdNET (TF.js)')
for (const f of BIRDNET_FILES) {
  await download(`${BIRDNET_BASE}/${f}`, join(PUBLIC, 'models/birdnet', f))
}

console.log('MediaPipe WASM runtime')
await cp(
  join(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm'),
  join(PUBLIC, 'mediapipe'),
  { recursive: true },
)
console.log('  ✓ public/mediapipe')

console.log('\nDone. All models are served locally — no inference API needed.')
