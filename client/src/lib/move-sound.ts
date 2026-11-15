/**
 * Short wooden "tock" when a piece lands, synthesised with Web Audio so there
 * are no sound files to ship or license. A capture is a sharper, heavier knock.
 *
 * Browsers only allow audio after a user gesture; the first call happens from a
 * board tap, which unlocks the AudioContext.
 */

export type MoveSoundKind = 'move' | 'capture';

const PREF_KEY = 'move-sound-enabled';
const CHANGE_EVENT = 'move-sound-pref-change';

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function isMoveSoundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMoveSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Preference just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeMoveSoundPref(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

function getNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

const VOICES: Record<
  MoveSoundKind,
  {
    clickHz: number;
    clickQ: number;
    clickGain: number;
    bodyHz: number;
    bodyGain: number;
    decay: number;
  }
> = {
  // Felt-bottomed piece on a wooden board.
  move: { clickHz: 1700, clickQ: 1.2, clickGain: 0.5, bodyHz: 190, bodyGain: 0.35, decay: 0.06 },
  // Piece knocked off and replaced: brighter attack, deeper body, a touch longer.
  capture: { clickHz: 2600, clickQ: 0.9, clickGain: 0.7, bodyHz: 130, bodyGain: 0.5, decay: 0.09 },
};

/** Schedule the sound on any audio context (exported for offline rendering in tests). */
export function scheduleMoveSound(ctx: BaseAudioContext, kind: MoveSoundKind, at: number) {
  const v = VOICES[kind];
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(ctx.destination);

  // Attack: a band-passed noise burst is the "click" of wood on wood.
  const noise = ctx.createBufferSource();
  noise.buffer = getNoise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = v.clickHz;
  band.Q.value = v.clickQ;
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(v.clickGain, at);
  clickEnv.gain.exponentialRampToValueAtTime(0.001, at + v.decay * 0.6);
  noise.connect(band).connect(clickEnv).connect(out);
  noise.start(at);
  noise.stop(at + v.decay);

  // Body: a quick falling sine gives the hollow "tock" of the board.
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(v.bodyHz * 1.4, at);
  body.frequency.exponentialRampToValueAtTime(v.bodyHz, at + v.decay * 0.5);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, at);
  bodyEnv.gain.exponentialRampToValueAtTime(v.bodyGain, at + 0.004);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, at + v.decay * 1.5);
  body.connect(bodyEnv).connect(out);
  body.start(at);
  body.stop(at + v.decay * 1.6);
}

/** Play the move sound if enabled. Never throws: a missing sound must not break a move. */
export function playMoveSound(kind: MoveSoundKind) {
  if (!isMoveSoundEnabled()) return;
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    scheduleMoveSound(ctx, kind, ctx.currentTime + 0.005);
  } catch (error) {
    console.warn('[Sound] Could not play move sound', { kind, error });
  }
}
