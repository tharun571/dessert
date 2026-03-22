// Web Audio API sound synthesizer — no external files needed

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(
  freq: number,
  type: OscillatorType,
  durationMs: number,
  gainPeak: number,
  startDelay = 0,
) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startDelay);
  gain.gain.setValueAtTime(0, c.currentTime + startDelay);
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + startDelay + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startDelay + durationMs / 1000);

  osc.start(c.currentTime + startDelay);
  osc.stop(c.currentTime + startDelay + durationMs / 1000 + 0.01);
}

export function playClick() {
  try {
    tone(1100, 'sine', 40, 0.15);
  } catch (_) {}
}

export function playSuccess() {
  try {
    tone(700, 'sine', 100, 0.18, 0);
    tone(1050, 'sine', 120, 0.18, 0.08);
    tone(1400, 'sine', 150, 0.15, 0.18);
  } catch (_) {}
}

export function playPurchase() {
  try {
    tone(600, 'triangle', 80, 0.2, 0);
    tone(900, 'triangle', 80, 0.2, 0.09);
    tone(1200, 'triangle', 100, 0.18, 0.18);
  } catch (_) {}
}

export function playError() {
  try {
    tone(220, 'square', 120, 0.1);
  } catch (_) {}
}

export function playComplete() {
  try {
    tone(880, 'sine', 80, 0.18, 0);
    tone(1100, 'sine', 120, 0.15, 0.06);
  } catch (_) {}
}

export function playCelebrate() {
  try {
    tone(523, 'sine', 120, 0.18, 0);
    tone(659, 'sine', 120, 0.18, 0.12);
    tone(784, 'sine', 120, 0.18, 0.24);
    tone(1047, 'sine', 300, 0.22, 0.38);
    tone(1319, 'sine', 250, 0.18, 0.55);
  } catch (_) {}
}
