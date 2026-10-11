// "Trail pack": store the open models + field guide in Cache Storage so the
// app identifies birds with zero signal. The service worker serves from the
// same cache.

import { asset } from './base'

export const MODEL_CACHE = 'peep-models-v1'

const PHOTO_FILES = [
  '/models/aiy-birds/birds_V1.tflite',
  '/mediapipe/vision_wasm_internal.js',
  '/mediapipe/vision_wasm_internal.wasm',
  '/mediapipe/vision_wasm_nosimd_internal.js',
  '/mediapipe/vision_wasm_nosimd_internal.wasm',
  '/data/species.json',
]

const SOUND_FILES = [
  '/models/birdnet/model.json',
  ...Array.from({ length: 13 }, (_, i) => `/models/birdnet/group1-shard${i + 1}of13.bin`),
  '/models/birdnet/area-model/model.json',
  '/models/birdnet/area-model/group1-shard1of2.bin',
  '/models/birdnet/area-model/group1-shard2of2.bin',
  '/models/birdnet/labels/en_us.txt',
]

export const PACK_MB = 63

async function hasAll(files: string[]) {
  if (!('caches' in window)) return false
  const cache = await caches.open(MODEL_CACHE)
  const hits = await Promise.all(files.map((f) => cache.match(f)))
  return hits.every(Boolean)
}

const ALL_FILES = [...PHOTO_FILES, ...SOUND_FILES].map(asset)

export const trailPackReady = () => hasAll(ALL_FILES)

export async function downloadTrailPack(onProgress: (done: number, total: number) => void) {
  const cache = await caches.open(MODEL_CACHE)
  const files = ALL_FILES
  let done = 0
  for (const f of files) {
    if (!(await cache.match(f))) {
      const res = await fetch(f)
      // Dev servers answer missing files with index.html; never cache that.
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`Missing ${f} — run \`npm run setup\``)
      }
      await cache.put(f, res)
    }
    onProgress(++done, files.length)
  }
}
