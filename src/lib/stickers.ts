// Stickers reward getting outside — new species, new places, new days, dawn
// walks — not tapping the screen. Counting *unique species* means
// photographing the same pigeon 100 times earns nothing.

import type { Sighting } from './db'
import type { GlyphName } from '../components/Icons'

export interface Stats {
  species: number
  photoSpecies: number
  soundSpecies: number
  sightings: number
  days: number
  places: number
  dawn: boolean
  dusk: boolean
  weekend: boolean
  critters: number
  inFlock: boolean
}

export interface StickerDef {
  id: string
  name: string
  glyph: GlyphName
  /** [face, ring] — earthy tones from the parchment/sage/bark palette */
  colors: [string, string]
  desc: string
  progress: (s: Stats) => [number, number]
}

const count = (n: number, goal: number): [number, number] => [Math.min(n, goal), goal]
const flag = (b: boolean): [number, number] => [b ? 1 : 0, 1]

export const STICKERS: StickerDef[] = [
  { id: 'first', name: 'First Feather', glyph: 'feather', colors: ['#c5ceb0', '#6b7556'], desc: 'Spot your first bird', progress: (s) => count(s.species, 1) },
  { id: 'ten', name: 'Ten Wings', glyph: 'bird', colors: ['#dcd2bf', '#6f6853'], desc: 'Spot 10 different species', progress: (s) => count(s.species, 10) },
  { id: 'quarter', name: 'Flock of 25', glyph: 'gull', colors: ['#c9d3c4', '#56685f'], desc: 'Spot 25 different species', progress: (s) => count(s.species, 25) },
  { id: 'fifty', name: 'Half Century', glyph: 'owl', colors: ['#d8ccb4', '#4a4636'], desc: 'Spot 50 different species', progress: (s) => count(s.species, 50) },
  { id: 'hundred', name: 'Century Club', glyph: 'wings', colors: ['#e8d7a8', '#8f7136'], desc: 'Spot 100 different species', progress: (s) => count(s.species, 100) },
  { id: 'ear', name: 'Good Ears', glyph: 'ear', colors: ['#e3cbbb', '#8a5f48'], desc: 'Identify 5 species by sound', progress: (s) => count(s.soundSpecies, 5) },
  { id: 'lens', name: 'Sharp Eyes', glyph: 'lens', colors: ['#cdd8d2', '#4f6158'], desc: 'Identify 5 species by photo', progress: (s) => count(s.photoSpecies, 5) },
  { id: 'dawn', name: 'Early Bird', glyph: 'sunrise', colors: ['#efd6b5', '#a2683d'], desc: 'Log a bird before 7 am', progress: (s) => flag(s.dawn) },
  { id: 'dusk', name: 'Night Owl', glyph: 'moon', colors: ['#c8c9cf', '#3f4256'], desc: 'Log a bird after 7 pm', progress: (s) => flag(s.dusk) },
  { id: 'days', name: 'Fresh Air Week', glyph: 'leaf', colors: ['#d3dbbd', '#5f6b45'], desc: 'Go birding on 7 different days', progress: (s) => count(s.days, 7) },
  { id: 'places', name: 'Wanderer', glyph: 'compass', colors: ['#ddd0b8', '#6f6853'], desc: 'Find birds in 5 different places', progress: (s) => count(s.places, 5) },
  { id: 'weekend', name: 'Weekend Warrior', glyph: 'boot', colors: ['#d6cfc2', '#57503f'], desc: 'Bird on both Saturday and Sunday', progress: (s) => flag(s.weekend) },
  { id: 'critter', name: 'Not a Bird', glyph: 'frog', colors: ['#d2dbb7', '#5a6b36'], desc: 'Hear a frog, insect or mammal', progress: (s) => count(s.critters, 1) },
  { id: 'flock', name: 'Flock Together', glyph: 'heart', colors: ['#e6cdc4', '#8e544a'], desc: 'Join a flock with friends or family', progress: (s) => flag(s.inFlock) },
]

export function computeStats(sightings: Sighting[], inFlock: boolean): Stats {
  const birds = sightings.filter((s) => s.isBird)
  const species = new Set(birds.map((s) => s.sci))
  const photo = new Set(birds.filter((s) => s.method === 'photo').map((s) => s.sci))
  const sound = new Set(birds.filter((s) => s.method === 'sound').map((s) => s.sci))
  const days = new Set(birds.map((s) => new Date(s.ts).toDateString()))
  const places = new Set(birds.map((s) => s.cell).filter(Boolean))
  const hours = birds.map((s) => new Date(s.ts).getHours())

  // Both days of the same weekend: key each weekend by its Saturday's date.
  const sat = new Set<string>()
  const sun = new Set<string>()
  for (const s of birds) {
    const d = new Date(s.ts)
    if (d.getDay() === 6) sat.add(d.toDateString())
    if (d.getDay() === 0) sun.add(new Date(d.getTime() - 864e5).toDateString())
  }

  return {
    species: species.size,
    photoSpecies: photo.size,
    soundSpecies: sound.size,
    sightings: birds.length,
    days: days.size,
    places: places.size,
    dawn: hours.some((h) => h < 7 && h >= 3),
    dusk: hours.some((h) => h >= 19 || h < 3),
    weekend: [...sat].some((d) => sun.has(d)),
    critters: new Set(sightings.filter((s) => !s.isBird).map((s) => s.sci)).size,
    inFlock,
  }
}

export function earned(stats: Stats): StickerDef[] {
  return STICKERS.filter((st) => {
    const [n, goal] = st.progress(stats)
    return n >= goal
  })
}

/** The closest not-yet-earned sticker, for the "next goal" nudge. */
export function nextGoal(stats: Stats): { sticker: StickerDef; have: number; need: number } | null {
  let best: { sticker: StickerDef; have: number; need: number; ratio: number } | null = null
  for (const st of STICKERS) {
    const [have, need] = st.progress(stats)
    if (have >= need || st.id === 'flock') continue
    const ratio = have / need
    if (!best || ratio > best.ratio) best = { sticker: st, have, need, ratio }
  }
  return best
}
