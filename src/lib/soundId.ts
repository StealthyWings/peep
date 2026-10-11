// Main-thread wrapper around the BirdNET worker.

import type { Candidate } from './photoId'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const progressListeners = new Set<(p: number) => void>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./birdnet.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        progressListeners.forEach((l) => l(data.progress))
        return
      }
      const p = pending.get(data.id)
      if (!p) return
      pending.delete(data.id)
      if (data.error) p.reject(new Error(data.error))
      else p.resolve(data.result)
    }
  }
  return worker
}

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    getWorker().postMessage({ ...msg, id }, transfer)
  })
}

export function loadSoundModel(onProgress?: (p: number) => void) {
  if (onProgress) progressListeners.add(onProgress)
  return call<void>({ type: 'load-sound' }).finally(() => {
    if (onProgress) progressListeners.delete(onProgress)
  })
}

/** pcm: mono Float32 audio at 48 kHz. */
export function identifySound(pcm: Float32Array): Promise<Candidate[]> {
  return call<Candidate[]>({ type: 'predict', pcm }, [pcm.buffer])
}

/** Likelihood (0..1) of each species occurring at this place this week. */
export function speciesLikelihood(lat: number, lon: number): Promise<Record<string, number>> {
  return call({ type: 'area', lat, lon })
}
