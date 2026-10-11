import { useEffect, useMemo, useState } from 'react'
import type { Species } from '../lib/species'
import { Glyph } from './Icons'

interface Props {
  species: Species
  photo?: Blob | string | null
  className?: string
}

/** User photo → Wikipedia thumbnail (when online) → friendly placeholder. */
export function BirdImage({ species, photo, className = '' }: Props) {
  const blobUrl = useMemo(() => (photo instanceof Blob ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl])
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const src = blobUrl ?? ((typeof photo === 'string' && photo) || species.i || null)

  if (!src || failedSrc === src) {
    return (
      <div className={`bird-img placeholder ${className}`} aria-hidden>
        <Glyph name={species.nb ? 'frog' : 'bird'} strokeWidth={1} />
      </div>
    )
  }
  return <img className={`bird-img ${className}`} src={src} alt={species.c} loading="lazy" onError={() => setFailedSrc(src)} />
}
