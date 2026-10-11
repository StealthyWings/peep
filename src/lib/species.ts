// Offline field guide (built by scripts/build-species.mjs from Wikipedia).
import { asset } from './base'

export interface Species {
  /** scientific name */
  s: string
  /** common name */
  c: string
  /** 1 when it's not a bird (BirdNET also knows frogs, insects, mammals) */
  nb?: 1
  /** which models know it: "photo", "sound" or "photosound" */
  m: string
  /** Wikipedia article title */
  w?: string
  /** short summary */
  t?: string
  /** one cool fact */
  f?: string
  /** 1 when the fact was rewritten by Gemma (from the Wikipedia text) */
  g?: 1
  /** image thumbnail URL (only shown when online) */
  i?: string
}

let guide: Promise<Map<string, Species>> | null = null

export function loadGuide(): Promise<Map<string, Species>> {
  guide ??= fetch(asset('data/species.json'))
    .then((r) => {
      if (!r.ok || !r.headers.get('content-type')?.includes('json'))
        throw new Error('species.json missing — run `npm run build:species`')
      return r.json() as Promise<Species[]>
    })
    .then((list) => new Map(list.map((sp) => [sp.s, sp])))
    .catch((err) => {
      guide = null
      throw err
    })
  return guide
}

export function lookup(map: Map<string, Species> | null, sci: string, common?: string): Species {
  return map?.get(sci) ?? { s: sci, c: common || sci, m: '' }
}

export function wikiUrl(sp: Species) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent((sp.w ?? sp.s).replace(/ /g, '_'))}`
}
