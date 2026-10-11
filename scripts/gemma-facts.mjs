// Uses Gemma (Google's open-weight model) running locally through Ollama to
// rewrite each species' Wikipedia intro into one fun, grounded fact for the
// offline field guide. Runs on your own machine: no API key, no cost.
//
//   ollama pull gemma3:4b
//   node scripts/gemma-facts.mjs                # photo-model species first, then the rest
//   node scripts/gemma-facts.mjs --limit 200    # stop after 200 new facts
//   GEMMA_MODEL=gemma3:1b node scripts/gemma-facts.mjs
//
// Needs scripts/.cache/wikipedia.json (created by `npm run build:species`).
// Results are cached in scripts/.cache/gemma-facts.json, so you can stop and
// resume at any time. Every run re-applies the cache to public/data/species.json.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPECIES = join(ROOT, 'public/data/species.json')
const WIKI = join(ROOT, 'scripts/.cache/wikipedia.json')
const CACHE = join(ROOT, 'scripts/.cache/gemma-facts.json')
const MODEL = process.env.GEMMA_MODEL ?? 'gemma3:4b'
const OLLAMA = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const LIMIT = Number(arg('--limit') ?? Infinity)
// --try "Pavo cristatus,Corvus splendens": print facts for these species only, write nothing
const TRY = arg('--try')?.split(',').map((s) => s.trim())

const species = JSON.parse(await readFile(SPECIES, 'utf8'))
const wiki = JSON.parse(await readFile(WIKI, 'utf8'))
const cache = JSON.parse(await readFile(CACHE, 'utf8').catch(() => '{}'))

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400)
    .slice(0, 14)
}

// Gemma picks the most interesting sentence and condenses it. Picking (rather
// than free writing) keeps it anchored to what Wikipedia actually says.
function prompt(sp, sents) {
  return `You choose the "cool fact" for a birdwatching app's field guide entry on the ${sp.nb ? 'animal' : 'bird'} "${sp.c}" (${sp.s}).

Here are numbered sentences from its Wikipedia article:
${sents.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Pick the ONE sentence a person who just spotted it would find most fun or surprising.
Prefer: what it is famous for, its name, records, unusual behaviour or sounds, links with people or culture.
Avoid: taxonomy, range lists, size measurements, conservation status, plumage colours.

Then rewrite that sentence as a short fact, under 25 words, starting with "It" or the bird's name.
Keep exactly the same facts. Do not add, guess or embellish anything.

Answer on one line in this format: <sentence number>|<short fact>`
}

const STOP = new Set(
  'about after also along although among another because been being both could does during each either from have having into itself just like made make many more most much must only other over same should since some such than that their them then there these they this those through very well were what when where which while with within would your known called often'.split(' '),
)

/** Every meaningful word (and number) in the fact must appear in the source text. */
function grounded(fact, text, sp) {
  if (!fact || fact.length < 25 || fact.length > 220) return false
  const source = text.toLowerCase()
  const nums = fact.match(/\d[\d,.]*/g) ?? []
  if (!nums.every((n) => source.includes(n.replace(/[.,]$/, '')))) return false
  const nameWords = new Set(`${sp.c} ${sp.s}`.toLowerCase().split(/\W+/))
  const words = fact
    .toLowerCase()
    .match(/[a-z]{4,}/g)
    ?.filter((w) => !STOP.has(w) && !nameWords.has(w)) ?? []
  const found = words.filter((w) => source.includes(w.slice(0, Math.max(4, w.length - 3))))
  return words.length > 0 && found.length / words.length >= 0.85
}

async function generate(p) {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: p, stream: false, options: { temperature: 0.2, num_predict: 90 } }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const { response } = await res.json()
  return response.trim().split('\n')[0]
}

// It's a family app: skip facts that are true but not for a share card.
const UNSUITABLE = /\b(sex|sexual|lust|potency|genital|copulat|rape|incest)\w*/i

/** Returns { fact, how }: how is 'rewritten', or null when we keep the existing fact. */
async function factFor(sp, text) {
  const sents = sentences(text)
  if (sents.length < 2) return { fact: null, how: null }
  const raw = await generate(prompt(sp, sents))
  const m = raw.match(/^\D*(\d+)\s*[|:.)-]\s*(.+)$/)
  if (!m) return { fact: null, how: null, raw }
  let short = m[2]
    .trim()
    .replace(/^["'*\s]+|["'*\s]+$/g, '')
    .replace(/!+$/, '.')
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
  if ((short.match(/"/g) ?? []).length % 2) short = short.replace(/"/g, '') // unbalanced quotes
  if (!/[.?]$/.test(short)) short += '.'
  // "It ... each other" means Gemma described two species as one.
  const garbled = /^It\b.*\beach other\b/i.test(short)
  if (grounded(short, text, sp) && !UNSUITABLE.test(short) && !garbled) return { fact: short, how: 'rewritten', raw }
  return { fact: null, how: null, raw }
}

// Gemma sometimes ignores "avoid range/taxonomy/plumage"; those lose to the
// original sentence.
const DULL = [
  /\b(is|are) (found|distributed|resident|endemic)\b|\b(found|occurs?|ranges?|breeds?) (from|in|across|throughout|on)\b|\bnative to\b|\bwithin its .{0,20}range\b/i,
  /\b(formally |first )?described (by .{0,60} in|in) (the |his |her |their )?\d{4}\b|\bgenus\b|\bsubspecies\b|\bfamily\b|\bcounterpart\b|\bclassified\b|\bspecies complex\b|\bconspecific\b|\bsister species\b|\btetrapods\b/i,
  /\b(plumage|markings|gorget|upperparts|underparts)\b|\b(cm|mm)\b/i,
  /\bcommon and widespread\b|\bis a (small|medium|large)\b/i,
]
const isDull = (f) => DULL.some((re) => re.test(f))

async function applyAll() {
  let applied = 0
  for (const sp of species) {
    if (cache[sp.s] && !isDull(cache[sp.s])) {
      // Gemma's most common slip: "It's name" for "Its name".
      sp.f = cache[sp.s].replace(/^It's (?=(\w+ )?(name|song|call|bill|tail|diet|population|range|nest|eggs)\b)/, 'Its ')
      sp.g = 1 // condensed by Gemma, checked against the Wikipedia text
      applied++
    }
  }
  await writeFile(SPECIES, JSON.stringify(species))
  return applied
}

try {
  await fetch(`${OLLAMA}/api/tags`)
} catch {
  console.error(`Can't reach Ollama at ${OLLAMA}. Start Ollama and run: ollama pull ${MODEL}`)
  process.exit(1)
}

if (TRY) {
  for (const sci of TRY) {
    const sp = species.find((x) => x.s === sci)
    const text = wiki[sci]?.x
    if (!sp || !text) {
      console.log(`${sci}: not found`)
      continue
    }
    const { fact, how, raw } = await factFor(sp, text)
    console.log(`\n${sp.c}\n  before: ${sp.f}\n  gemma:  ${fact ?? '(none)'}  [${how ?? 'rejected'}]${how !== 'rewritten' ? `\n  raw:    ${raw}` : ''}`)
  }
  process.exit(0)
}

// Photo-model species first: those are the ones people photograph most.
const queue = species
  .filter((sp) => !(sp.s in cache) && (wiki[sp.s]?.x ?? '').length > 120)
  .sort((a, b) => Number(b.m.includes('photo')) - Number(a.m.includes('photo')))

const tally = { rewritten: 0, rejected: 0 }
const started = Date.now()
for (const [i, sp] of queue.entries()) {
  if (i >= LIMIT) break
  const { fact, how } = await factFor(sp, wiki[sp.s].x).catch((err) => {
    console.error(`\n${sp.s}: ${err.message}`)
    return { fact: null, how: null }
  })
  cache[sp.s] = fact // null keeps the heuristic fact
  tally[how ?? 'rejected']++
  if ((i + 1) % 10 === 0) await writeFile(CACHE, JSON.stringify(cache))
  if ((i + 1) % 50 === 0) await applyAll()
  const mins = (Date.now() - started) / 60000
  process.stdout.write(
    `\r  ${MODEL}: ${tally.rewritten} rewritten, ${tally.rejected} kept as-is,` +
      `${((i + 1) / mins).toFixed(1)}/min, ${queue.length - i - 1} left   `,
  )
}
await writeFile(CACHE, JSON.stringify(cache))

console.log(`\nApplied ${await applyAll()} Gemma facts to public/data/species.json`)
