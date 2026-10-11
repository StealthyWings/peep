// Image + location helpers.

export async function fileToBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

export async function bitmapToJpeg(img: ImageBitmap, maxSide: number, quality = 0.82): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality),
  )
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Small JPEG for the flock feed (only when the user opts in). */
export async function shareablePhoto(blob: Blob): Promise<string> {
  return blobToDataUrl(await bitmapToJpeg(await fileToBitmap(blob), 480, 0.72))
}

export interface Position {
  lat: number
  lon: number
}

/** Device location, used on-device only (species-likelihood model + Wanderer sticker). */
export function getPosition(timeout = 6000): Promise<Position | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    ),
  )
}

/** ~1 km grid cell — coarse on purpose. */
export const cellOf = (p: Position) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`
