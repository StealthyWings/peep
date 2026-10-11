// Photo identification with Google's open AIY Birds V1 model (Apache-2.0),
// executed on-device by MediaPipe Tasks (WASM). Nothing is uploaded.

import { FilesetResolver, ImageClassifier } from '@mediapipe/tasks-vision'
import { asset } from './base'

export interface Candidate {
  sci: string
  score: number
}

let classifier: Promise<ImageClassifier> | null = null

export function loadPhotoModel(): Promise<ImageClassifier> {
  classifier ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(asset('mediapipe'))
    return ImageClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/aiy-birds/birds_V1.tflite') },
      runningMode: 'IMAGE',
      maxResults: 8,
      displayNamesLocale: 'en',
    })
  })().catch((err) => {
    classifier = null
    throw err
  })
  return classifier
}

/** Square crop centred on (cx, cy) in 0..1 coordinates, `size` = fraction of the short side. */
function crop(img: ImageBitmap, cx: number, cy: number, size: number): HTMLCanvasElement {
  const side = Math.min(img.width, img.height) * size
  const x = Math.min(Math.max(cx * img.width - side / 2, 0), img.width - side)
  const y = Math.min(Math.max(cy * img.height - side / 2, 0), img.height - side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 320
  canvas.getContext('2d')!.drawImage(img, x, y, side, side, 0, 0, 320, 320)
  return canvas
}

/**
 * Birds are often small in a phone photo, so we look at several crops (the
 * whole frame plus progressively tighter ones around the focus point) and keep
 * each species' best score. `focus` is where the user tapped, if they did.
 */
export async function identifyPhoto(
  img: ImageBitmap,
  focus?: { x: number; y: number },
): Promise<Candidate[]> {
  const model = await loadPhotoModel()
  const cx = focus?.x ?? 0.5
  const cy = focus?.y ?? 0.5
  const views = focus
    ? [crop(img, cx, cy, 0.7), crop(img, cx, cy, 0.45), crop(img, cx, cy, 0.3)]
    : [crop(img, 0.5, 0.5, 1), crop(img, 0.5, 0.5, 0.7), crop(img, 0.5, 0.5, 0.45)]

  const best = new Map<string, number>()
  for (const view of views) {
    const result = model.classify(view)
    for (const c of result.classifications[0]?.categories ?? []) {
      const sci = c.displayName || c.categoryName
      if (!sci || sci === 'background') continue
      best.set(sci, Math.max(best.get(sci) ?? 0, c.score))
    }
  }
  return [...best.entries()]
    .map(([sci, score]) => ({ sci, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}
