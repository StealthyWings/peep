// Builds public/data/species.json: an offline field guide for every species
// the two open models can recognise (AIY photo model + BirdNET sound model).
// Text comes from Wikipedia (CC BY-SA 4.0) and is attributed in the app.
//
//   node scripts/build-species.mjs
//
// Run scripts/fetch-models.mjs first (it provides the BirdNET label list).

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'

// Some networks stall on IPv6 to Wikimedia; prefer IPv4.
dns.setDefaultResultOrder('ipv4first')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/data/species.json')
// Wikimedia throttles clients without contact info in the User-Agent.
// Set WIKI_CONTACT to your repo URL or email when you fork this.
const CONTACT = process.env.WIKI_CONTACT ?? 'https://github.com/topics/hacktoberfest'
const UA = `PeepBirdApp/0.1 (${CONTACT}; open-source field guide build script)`

// Sound classes BirdNET uses for "not an animal" — never shown as species.
const NOISE = new Set([
  'Dog', 'Engine', 'Environmental', 'Fireworks', 'Gun', 'Human non-vocal',
  'Human vocal', 'Human whistle', 'Noise', 'Power tools', 'Siren',
])

// ---- 1. Collect species from both models ---------------------------------

const species = new Map() // sci -> { s, c, m: [] }

const aiyCsv = await (
  await fetch('https://www.gstatic.com/aihub/tfhub/labelmaps/aiy_birds_V1_labelmap.csv')
).text()
for (const line of aiyCsv.trim().split('\n').slice(1)) {
  const sci = line.slice(line.indexOf(',') + 1).trim()
  if (!sci || sci === 'background') continue
  species.set(sci, { s: sci, c: '', m: ['photo'] })
}

const birdnet = await readFile(join(ROOT, 'public/models/birdnet/labels/en_us.txt'), 'utf8')
for (const line of birdnet.split('\n')) {
  const [sci, common] = line.trim().split('_')
  if (!sci || NOISE.has(sci)) continue
  const entry = species.get(sci) ?? { s: sci, c: '', m: [] }
  entry.m.push('sound')
  if (common && common !== sci) entry.c = common
  species.set(sci, entry)
}
console.log(`${species.size} species across both models`)

// ---- 2. Fetch Wikipedia intros in batches --------------------------------

const all = [...species.values()]
const BATCH = 20 // TextExtracts returns at most 20 intros per request
const batches = []
for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH))

async function wiki(titles, attempt = 0) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'extracts|pageimages|description',
    exintro: '1',
    explaintext: '1',
    exlimit: '20',
    piprop: 'thumbnail',
    pithumbsize: '480',
    pilimit: '20',
    titles: titles.join('|'),
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  }).catch((err) => ({ ok: false, status: err.name, headers: new Headers() }))
  if (!res.ok) {
    if (attempt < 8) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1)
      await new Promise((r) => setTimeout(r, wait))
      return wiki(titles, attempt + 1)
    }
    throw new Error(`Wikipedia ${res.status}`)
  }
  return res.json()
}

// Raw Wikipedia responses are cached so re-running the script is instant.
const CACHE = join(ROOT, 'scripts/.cache/wikipedia.json')
const cache = JSON.parse(await readFile(CACHE, 'utf8').catch(() => '{}'))

let done = 0
for (const group of batches) {
  const todo = group.filter((g) => !(g.s in cache))
  if (todo.length) {
    const data = await wiki(todo.map((g) => g.s))
    const q = data.query ?? {}
    // Follow normalisation + redirects back to the scientific name we asked for.
    const alias = new Map()
    for (const n of q.normalized ?? []) alias.set(n.to, n.from)
    for (const r of q.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from)
    for (const g of todo) cache[g.s] = null
    for (const page of q.pages ?? []) {
      if (page.missing) continue
      const sci = alias.get(page.title) ?? page.title
      if (!(sci in cache)) continue
      cache[sci] = {
        w: page.title,
        d: page.description ?? '',
        x: page.extract ?? '',
        i: page.thumbnail?.source ?? '',
      }
    }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(cache))
    await new Promise((r) => setTimeout(r, 300)) // be polite to Wikimedia
  }
  for (const g of group) Object.assign(g, cache[g.s] ?? {})
  done += group.length
  process.stdout.write(`\r  wikipedia ${done}/${all.length}`)
}
process.stdout.write('\n')

// ---- 3. Derive name, summary and one cool fact ---------------------------

function titleCase(name) {
  // Birding convention: "Black-capped chickadee" -> "Black-capped Chickadee"
  return name
    .replace(/\s*\(.*?\)\s*/g, '')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(([^()]*)\)/g, (m) => (m.length > 60 ? '' : m)) // drop long asides
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 260)
}

const FUN = [
  [/\b(only|unique|unusual|remarkabl|famous|known for|nicknamed|record|largest|smallest|fastest|longest|heaviest|loudest|oldest|one of the (few|most|largest|smallest)|most (widely|common|abundant|numerous))\b/i, 3],
  [/\b(mimic|imitat|sings?|song|duet|drum|dance|display|courtship|bower|decorat|melodious|bellow|whistl|laugh)\w*/i, 2.5],
  [/\b(can |able to|capable|uses? (its|tools)|tool|adapt)\w*/i, 2],
  [/\b(migrat|flies|fly |dive|hover|nocturnal|at night|upside[- ]down)\w*/i, 1.5],
  [/\b(nest|eggs|chicks|mates?|monogam|cooperative|brood parasit|lays)\w*/i, 1.5],
  [/\b(named after|name (comes|refers|derives)|gets its (common )?name|derives? from|meaning|national bird|state bird|symbol|folklore|myth|legend|sacred|culture|first time|associated with human)\b/i, 3],
  [/\b(eats?|feeds?|hunts?|prey|diet|nectar|fruit|catches)\b/i, 1],
  [/\b(years? old|lifespan|live (up )?to|speeds?|km\/h|mph)\b/i, 2],
]
const DULL = [
  [/\b(taxonom|subspecies|genus|family|classified|described by|binomial|monotypic|clade|phylogen|formerly|placed in|lumped|split|sister|true thrush|tribe)\w*/i, -4],
  [/\b(IUCN|Least Concern|Red List|evaluated|assessed|conservation status|least concern)\b/i, -3],
  [/\b(also known as|is known as|or simply)\b/i, -3],
  [/\b(is a species of|is a (small|medium|large)|belonging to)\b/i, -2],
  [/\b(is found in|found throughout|native to|range (is|extends|includes)|distributed|distribution|occurs in|its range|breeds in|resident (in|breeder)|natural habitats?|habitat is|lives in|inhabits?|it is found)\b/i, -2],
  [/\b(cm|mm|in length|wingspan|weighs|mass of|g \()/i, -3],
  [/\b(plumage|colou?red|markings|upperparts|underparts|crown|breast|bill is)\b/i, -1.5],
]

function scoreOf(s, i) {
  let score = i === 0 ? -2 : 0 // the opening line is usually a definition
  for (const [re, w] of [...FUN, ...DULL]) if (re.test(s)) score += w
  return score
}

function pickFact(sents) {
  let best = null
  let bestScore = -Infinity
  sents.forEach((s, i) => {
    const score = scoreOf(s, i)
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  })
  return best ?? ''
}

// BirdNET also knows frogs, insects and mammals; flag them so they don't
// count toward bird stickers. Wikipedia's short description ("Species of
// bird", "Species of cricket") is the most reliable signal.
const NOT_BIRD = /\b(frog|toad|amphibian|insect|cricket|katydid|cicada|grasshopper|orthopter|mammal|monkey|primate|squirrel|chipmunk|rodent|bat|deer|canine|coyote|wolf|fox|whale)s?\b/i
const isBirdEntry = (e) =>
  e.m.includes('photo') ||
  (e.d ? /bird|fowl/i.test(e.d) || !NOT_BIRD.test(e.d) : !NOT_BIRD.test((e.x ?? '').slice(0, 160)))

const out = []
let withFact = 0
let critters = 0
for (const e of species.values()) {
  const sents = sentences(e.x ?? '')
  const isBird = isBirdEntry(e)
  if (!isBird) critters++
  const common = e.c || (e.w && e.w !== e.s ? titleCase(e.w) : e.s)
  const fact = pickFact(sents)
  // Summary: the opening sentences, without repeating the fact.
  const summary = sents.filter((x) => x !== fact).slice(0, 2).join(' ')
  if (fact) withFact++
  out.push({
    s: e.s,
    c: common,
    ...(isBird ? {} : { nb: 1 }),
    m: e.m.join(''), // "photo", "sound" or "photosound"
    ...(e.w ? { w: e.w } : {}),
    ...(summary ? { t: summary } : {}),
    ...(fact ? { f: fact } : {}),
    ...(e.i ? { i: e.i } : {}),
  })
}
console.log(`${critters} non-bird sound classes`)
out.sort((a, b) => a.s.localeCompare(b.s))

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(out))
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)
console.log(`Wrote ${out.length} species (${withFact} with a fact) to public/data/species.json (${kb} KB)`)
