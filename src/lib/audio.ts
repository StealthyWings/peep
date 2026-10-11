// Microphone capture + decoding to the 48 kHz mono PCM BirdNET expects.

export const MAX_SECONDS = 30

export async function startRecording(): Promise<{ stop: () => Promise<Blob>; stream: MediaStream }> {
  // Phone "voice" processing (noise suppression, AGC) erases birdsong — turn it off.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  const stop = () =>
    new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        resolve(new Blob(chunks, { type: recorder.mimeType }))
      }
      recorder.stop()
    })
  return { stop, stream }
}

export async function decodeTo48kMono(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  const seconds = Math.min(decoded.duration, MAX_SECONDS)
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * 48000)), 48000)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/** Live input level 0..1 for the "listening" animation. */
export function levelMeter(stream: MediaStream, onLevel: (v: number) => void) {
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  let raf = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
    onLevel(Math.min(1, peak / 64))
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    ctx.close()
  }
}
