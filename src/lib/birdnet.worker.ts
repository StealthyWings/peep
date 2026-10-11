/// <reference lib="webworker" />
// BirdNET sound identification + location/season prior, run entirely in a
// Web Worker with TensorFlow.js. Adapted from the BirdNET team's
// real-time-pwa (MIT) which is based on github.com/georg95/birdnet-web.
// Model weights: BirdNET, K. Lisa Yang Center for Conservation Bioacoustics,
// CC BY-SA 4.0.

import * as tf from '@tensorflow/tfjs'
import { asset } from './base'

const BASE = asset('models/birdnet')
const SAMPLE_RATE = 48000
const WINDOW = 144000 // BirdNET looks at 3 s windows

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mel-spectrogram layer baked into the BirdNET graph (the model takes raw audio).
class MelSpecLayerSimple extends tf.layers.Layer {
  static className = 'MelSpecLayerSimple'
  private frameStep: number
  private frameLength: number
  private specShape: number[]
  private melFilterbank: tf.Tensor2D
  private magScale!: tf.LayerVariable

  constructor(config: any) {
    super(config)
    this.specShape = config.specShape
    this.frameStep = config.frameStep
    this.frameLength = config.frameLength
    this.melFilterbank = tf.tensor2d(config.melFilterbank)
  }

  build() {
    this.magScale = this.addWeight('magnitude_scaling', [], 'float32', tf.initializers.constant({ value: 1.23 }))
    super.build([])
  }

  computeOutputShape(inputShape: any) {
    return [inputShape[0], this.specShape[0], this.specShape[1], 1]
  }

  call(inputs: any) {
    return tf.tidy(() => {
      const x = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor
      return tf.stack(
        x.split(x.shape[0]).map((input) => {
          let spec = input.squeeze()
          spec = tf.sub(spec, tf.min(spec, -1, true))
          spec = tf.div(spec, tf.max(spec, -1, true).add(1e-6))
          spec = tf.sub(spec, 0.5).mul(2.0)
          spec = tf.engine().runKernel('STFT', {
            signal: spec,
            frameLength: this.frameLength,
            frameStep: this.frameStep,
          } as any) as tf.Tensor
          spec = tf.matMul(spec as tf.Tensor2D, this.melFilterbank).pow(2.0)
          spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))))
          spec = tf.reverse(spec, -1)
          return tf.transpose(spec).expandDims(-1)
        }),
      )
    })
  }
}

// WebGL FFT kernel used by the layer above.
tf.registerKernel({
  kernelName: 'STFT',
  backendName: 'webgl',
  kernelFunc: ({ backend, inputs }: any) => {
    const { signal, frameLength, frameStep } = inputs
    const innerDim = frameLength / 2
    const log2 = Math.log2(innerDim)
    const batch = ((signal.size - frameLength + frameStep) / frameStep) | 0

    let current = backend.runWebGLProgram(
      {
        variableNames: ['x'],
        outputShape: [batch, frameLength],
        userCode: `void main(){
          ivec2 c=getOutputCoords();
          int p=c[1]%${innerDim};
          int k=0;
          for(int i=0;i<${log2};++i){ if((p & (1<<i))!=0){ k|=(1<<(${log2 - 1}-i)); } }
          int i=2*k;
          if(c[1]>=${innerDim}){ i=2*(k%${innerDim})+1; }
          int q=c[0]*${frameLength}+i;
          float val=getX((q/${frameLength})*${frameStep}+ q % ${frameLength});
          float cosArg=${(2.0 * Math.PI) / frameLength}*float(q);
          float mul=0.5-0.5*cos(cosArg);
          setOutput(val*mul);
        }`,
      },
      [signal],
      'float32',
    )

    for (let len = 1; len < innerDim; len *= 2) {
      const prev = current
      current = backend.runWebGLProgram(
        {
          variableNames: ['x'],
          outputShape: [batch, innerDim * 2],
          userCode: `void main(){
            ivec2 c=getOutputCoords();
            int b=c[0];
            int i=c[1];
            int k=i%${innerDim};
            int isHigh=(k%${len * 2})/${len};
            int highSign=(1 - isHigh*2);
            int baseIndex=k - isHigh*${len};
            float t=${Math.PI / len}*float(k%${len});
            float a=cos(t);
            float bsin=sin(-t);
            float oddK_re=getX(b, baseIndex+${len});
            float oddK_im=getX(b, baseIndex+${len + innerDim});
            if(i<${innerDim}){
              float evenK_re=getX(b, baseIndex);
              setOutput(evenK_re + (oddK_re*a - oddK_im*bsin)*float(highSign));
            } else {
              float evenK_im=getX(b, baseIndex+${innerDim});
              setOutput(evenK_im + (oddK_re*bsin + oddK_im*a)*float(highSign));
            }
          }`,
        },
        [prev],
        'float32',
      )
      backend.disposeIntermediateTensorInfo(prev)
    }

    const real = backend.runWebGLProgram(
      {
        variableNames: ['x'],
        outputShape: [batch, innerDim + 1],
        userCode: `void main(){
          ivec2 c=getOutputCoords();
          int b=c[0];
          int i=c[1];
          int zI=i%${innerDim};
          int conjI=(${innerDim}-i)%${innerDim};
          float Zk0=getX(b,zI);
          float Zk1=getX(b,zI+${innerDim});
          float Zk_conj0=getX(b,conjI);
          float Zk_conj1=-getX(b,conjI+${innerDim});
          float t=${-2.0 * Math.PI}*float(i)/float(${innerDim * 2});
          float diff0=Zk0 - Zk_conj0;
          float diff1=Zk1 - Zk_conj1;
          float result=(Zk0+Zk_conj0 + cos(t)*diff1 + sin(t)*diff0)*0.5;
          setOutput(result);
        }`,
      },
      [current],
      'float32',
    )
    backend.disposeIntermediateTensorInfo(current)
    return real
  },
})

// ---- state -------------------------------------------------------------------

let ready: Promise<void> | null = null
let soundModel: tf.LayersModel | null = null
let soundLoading: Promise<void> | null = null
let areaModel: Promise<tf.GraphModel> | null = null
let labels: string[] = []

async function ensureBackend() {
  ready ??= (async () => {
    await tf.setBackend('webgl')
    tf.serialization.registerClass(MelSpecLayerSimple)
    const text = await (await fetch(`${BASE}/labels/en_us.txt`)).text()
    labels = text.split('\n').map((l) => l.trim().split('_')[0])
  })()
  return ready
}

function loadSound() {
  soundLoading ??= (async () => {
    await ensureBackend()
    soundModel = await tf.loadLayersModel(`${BASE}/model.json`, {
      onProgress: (p) => postMessage({ type: 'progress', what: 'sound', progress: p }),
    })
    tf.tidy(() => {
      soundModel!.predict(tf.zeros([1, WINDOW]))
    })
  })().catch((err) => {
    soundLoading = null
    throw err
  })
  return soundLoading
}

function loadArea() {
  areaModel ??= ensureBackend()
    .then(() => tf.loadGraphModel(`${BASE}/area-model/model.json`))
    .catch((err) => {
      areaModel = null
      throw err
    })
  return areaModel
}

/** BirdNET's meta-model uses 48 "weeks" per year (4 per month). */
function birdnetWeek(d = new Date()) {
  return d.getMonth() * 4 + Math.min(4, Math.floor((d.getDate() - 1) / 7) + 1)
}

async function predict(pcm: Float32Array) {
  await loadSound()
  const hop = WINDOW - SAMPLE_RATE * 1.5 // 1.5 s overlap
  const frames = Math.max(1, Math.ceil(Math.max(0, pcm.length - WINDOW) / hop) + 1)
  const framed = new Float32Array(frames * WINDOW)
  for (let f = 0; f < frames; f++) {
    const start = f * hop
    framed.set(pcm.subarray(start, Math.min(start + WINDOW, pcm.length)), f * WINDOW)
  }
  const input = tf.tensor2d(framed, [frames, WINDOW])
  const output = soundModel!.predict(input) as tf.Tensor
  const rows = (await output.array()) as number[][]
  input.dispose()
  output.dispose()

  // Pool frames with log-mean-exp (rewards a species heard clearly in any window).
  const ALPHA = 5
  const pooled = rows[0].map((_, i) => {
    let sum = 0
    for (const row of rows) sum += Math.exp(ALPHA * row[i])
    return Math.log(sum / rows.length) / ALPHA
  })
  return pooled
    .map((score, i) => ({ sci: labels[i], score }))
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

async function areaScores(lat: number, lon: number) {
  const model = await loadArea()
  const scores = tf.tidy(() =>
    model.predict(tf.tensor([[lat, lon, birdnetWeek()]])) as tf.Tensor,
  )
  const data = await scores.data()
  scores.dispose()
  const out: Record<string, number> = {}
  labels.forEach((sci, i) => (out[sci] = data[i]))
  return out
}

self.onmessage = async ({ data }: MessageEvent) => {
  const { id, type } = data
  try {
    let result: unknown
    if (type === 'load-sound') result = await loadSound()
    else if (type === 'predict') result = await predict(data.pcm)
    else if (type === 'area') result = await areaScores(data.lat, data.lon)
    postMessage({ id, result })
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
