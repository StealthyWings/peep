import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { allSightings, deleteSighting, getKV, putSighting, setKV, type Sighting } from './lib/db'
import { loadGuide, lookup, type Species } from './lib/species'
import { computeStats, earned } from './lib/stickers'
import {
  deleteRemoteSighting,
  getProfile,
  syncSightings,
  updateMe,
  type Group,
  type Profile,
} from './lib/flock'
import { SpotScreen } from './components/SpotScreen'
import { LifeList } from './components/LifeList'
import { FlockScreen } from './components/FlockScreen'
import { IdentifyFlow, type IdRequest } from './components/IdentifyFlow'
import { SpeciesSheet } from './components/SpeciesSheet'
import { Glyph, type GlyphName } from './components/Icons'

type Tab = 'spot' | 'list' | 'flock'

const TABS: { id: Tab; icon: GlyphName; label: string }[] = [
  { id: 'spot', icon: 'binoculars', label: 'Spot' },
  { id: 'list', icon: 'book', label: 'Life list' },
  { id: 'flock', icon: 'flock', label: 'Flock' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('spot')
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [guide, setGuide] = useState<Map<string, Species> | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [inFlock, setInFlock] = useState(false)
  const [useLocation, setUseLocation] = useState(true)
  const [handsFree, setHandsFree] = useState(false)
  const [sharePhotos, setSharePhotos] = useState(false)
  const [request, setRequest] = useState<IdRequest | null>(null)
  const [openSci, setOpenSci] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingJoin, setPendingJoin] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('join'),
  )

  const reload = useCallback(async () => setSightings(await allSightings()), [])

  useEffect(() => {
    reload()
    loadGuide().then(setGuide).catch(console.error)
    getProfile().then((p) => p && setProfile(p))
    getKV<boolean>('inFlock').then((v) => setInFlock(!!v))
    getKV<boolean>('useLocation').then((v) => v !== undefined && setUseLocation(v))
    getKV<boolean>('handsFree').then((v) => setHandsFree(!!v))
    getKV<boolean>('sharePhotos').then((v) => setSharePhotos(!!v))
    if (pendingJoin) {
      setTab('flock')
      history.replaceState(null, '', location.pathname)
    }
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => computeStats(sightings, inFlock), [sightings, inFlock])
  const knownSpecies = useMemo(() => new Set(sightings.filter((s) => s.isBird).map((s) => s.sci)), [sightings])

  const syncing = useRef<Promise<void> | null>(null)
  const sync = useCallback(() => {
    if (!profile || !navigator.onLine) return Promise.resolve()
    syncing.current ??= (async () => {
      try {
        await syncSightings(profile)
        const stickers = earned(computeStats(await allSightings(), inFlock)).map((s) => s.id)
        await updateMe(profile, { stickers })
        reload()
      } catch {
        /* offline or server down: we'll try again later */
      } finally {
        syncing.current = null
      }
    })()
    return syncing.current
  }, [profile, inFlock, reload])

  // Catch up whenever connectivity returns.
  useEffect(() => {
    if (online) sync()
  }, [online, sync])

  async function save(s: Sighting) {
    const before = new Set(earned(stats).map((x) => x.id))
    await putSighting(s)
    const next = await allSightings()
    setSightings(next)
    const nextStats = computeStats(next, inFlock)
    sync()
    return {
      newStickers: earned(nextStats).filter((x) => !before.has(x.id)),
      speciesCount: nextStats.species,
    }
  }

  async function update(s: Sighting) {
    await putSighting(s)
    await setKV('sharePhotos', s.sharePhoto)
    setSharePhotos(s.sharePhoto)
    await reload()
    sync()
  }

  async function remove(s: Sighting) {
    await deleteSighting(s.id)
    if (profile && s.synced) deleteRemoteSighting(profile, s.id).catch(() => {})
    const next = await allSightings()
    setSightings(next)
    if (!next.some((x) => x.sci === s.sci)) setOpenSci(null)
  }

  function onGroups(gs: Group[]) {
    const v = gs.length > 0
    setInFlock(v)
    setKV('inFlock', v)
  }

  // Order of first sighting, for "my 12th species" on share cards.
  const speciesOrder = useMemo(() => {
    const firsts = new Map<string, number>()
    for (const s of sightings) if (s.isBird) firsts.set(s.sci, Math.min(s.ts, firsts.get(s.sci) ?? Infinity))
    return [...firsts.entries()].sort((a, b) => a[1] - b[1]).map(([sci]) => sci)
  }, [sightings])

  return (
    <div className="app">
      <nav className="tabs">
        <span className="brand side-brand">peep</span>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
            <Glyph name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
        <p className="side-note">Identification runs on this device. Nothing you record is uploaded.</p>
      </nav>

      <div className="topbar">
        <span className="brand">peep</span>
        {!online && <span className="net">Offline. Identification still works.</span>}
      </div>

      <main>
        {tab === 'spot' && (
          <SpotScreen
            sightings={sightings}
            stats={stats}
            useLocation={useLocation}
            onToggleLocation={(v) => {
              setUseLocation(v)
              setKV('useLocation', v)
            }}
            handsFree={handsFree}
            onToggleHandsFree={(v) => {
              setHandsFree(v)
              setKV('handsFree', v)
            }}
            onStart={setRequest}
          />
        )}
        {tab === 'list' && <LifeList sightings={sightings} stats={stats} guide={guide} onOpen={setOpenSci} />}
        {tab === 'flock' && (
          <FlockScreen
            profile={profile}
            guide={guide}
            pendingJoin={pendingJoin}
            onProfile={setProfile}
            onGroups={onGroups}
            onJoinHandled={() => setPendingJoin(null)}
            onGoOutside={() => setTab('spot')}
            syncNow={sync}
          />
        )}
      </main>

      {request && (
        <IdentifyFlow
          request={request}
          guide={guide}
          useLocation={useLocation}
          sharePhotosDefault={sharePhotos}
          canShareWithFlock={!!profile && inFlock}
          userName={profile?.name}
          knownSpecies={knownSpecies}
          handsFree={handsFree}
          onSave={save}
          onUpdate={update}
          onClose={() => setRequest(null)}
        />
      )}

      {openSci && (
        <SpeciesSheet
          species={lookup(guide, openSci, sightings.find((s) => s.sci === openSci)?.common)}
          sightings={sightings.filter((s) => s.sci === openSci)}
          speciesIndex={speciesOrder.indexOf(openSci) + 1}
          userName={profile?.name}
          onDelete={remove}
          onClose={() => setOpenSci(null)}
        />
      )}
    </div>
  )
}
