/** Efeitos sonoros sintetizados (WebAudio): nenhum arquivo de áudio necessário. */
let ctx: AudioContext | null = null;

const enabled = () => {
  try { return localStorage.getItem("frixep_sound") !== "off"; } catch { return true; }
};

function ac(): AudioContext | null {
  if (!enabled()) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noise(c: AudioContext, dur: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  return s;
}

function env(c: AudioContext, g: GainNode, peak: number, attack: number, decay: number) {
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
  env(c, g, peak, 0.005, dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

function whoosh(from: number, to: number, dur: number, peak: number) {
  const c = ac();
  if (!c) return;
  const n = noise(c, dur + 0.05);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(from, c.currentTime);
  bp.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  env(c, g, peak, dur * 0.25, dur * 0.75);
  n.connect(bp).connect(g).connect(c.destination);
  n.start();
}

export const sfx = {
  swing: () => whoosh(600, 2400, 0.16, 0.25),
  whirl: () => whoosh(300, 1800, 0.35, 0.3),
  dash: () => whoosh(1800, 300, 0.22, 0.3),
  shout: () => { tone("sawtooth", 140, 90, 0.4, 0.18); tone("square", 70, 60, 0.4, 0.1); },
  hit: (crit: boolean) => {
    tone("triangle", crit ? 220 : 160, 50, 0.12, crit ? 0.5 : 0.38);
    const c = ac();
    if (!c) return;
    const n = noise(c, 0.06);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const g = c.createGain();
    env(c, g, crit ? 0.35 : 0.22, 0.002, 0.05);
    n.connect(hp).connect(g).connect(c.destination);
    n.start();
    if (crit) tone("sine", 880, 1320, 0.12, 0.12);
  },
  hurt: () => { tone("sawtooth", 180, 60, 0.28, 0.35); whoosh(900, 200, 0.2, 0.2); },
  die: () => { tone("sawtooth", 200, 35, 0.8, 0.35); },
  enemyDie: () => { tone("triangle", 320, 70, 0.35, 0.3); whoosh(2000, 300, 0.3, 0.12); },
  levelUp: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone("triangle", f, f * 1.01, 0.28, 0.22), i * 90)); },
  warn: () => tone("square", 330, 300, 0.09, 0.05),
};
