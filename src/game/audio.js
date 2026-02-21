const DEFAULT_PRIORITY = {
  run_start: 5,
  boss_spawn: 5,
  boss_phase: 5,
  overdrive_peak: 5,
  revive: 5,
  player_hurt: 4,
  pickup_chest: 4,
  combo: 4,
  pulse: 4,
  overdrive_start: 4,
  boss_break: 4,
  levelup: 3,
  skill_pick: 3,
  kill: 3,
  boss_hit: 3,
  dash: 2,
  pickup_heal: 2,
  adrenaline: 2,
  crit: 2,
  pickup_xp: 1,
  orbit_hit: 1,
  hit: 1,
};

const SOUND_PROFILE = {
  hit: { freq: 420, type: "triangle", duration: 0.04 },
  crit: { freq: 720, type: "square", duration: 0.06 },
  kill: { freq: 250, type: "sawtooth", duration: 0.09 },
  combo: { freq: 330, type: "square", duration: 0.12 },
  levelup: { freq: 540, type: "triangle", duration: 0.14 },
  skill_pick: { freq: 620, type: "triangle", duration: 0.08, secondFreq: 820 },
  run_start: { freq: 280, type: "sawtooth", duration: 0.16, secondFreq: 420 },
  boss_spawn: { freq: 90, type: "sawtooth", duration: 0.3, secondFreq: 130, gain: 0.06 },
  boss_hit: { freq: 180, type: "sawtooth", duration: 0.1 },
  boss_phase: { freq: 120, type: "sawtooth", duration: 0.18 },
  boss_break: { freq: 210, type: "triangle", duration: 0.11, secondFreq: 280 },
  player_hurt: { freq: 150, type: "square", duration: 0.08 },
  dash: { freq: 390, type: "triangle", duration: 0.05 },
  pickup_xp: { freq: 740, type: "triangle", duration: 0.03, gain: 0.02 },
  pickup_heal: { freq: 520, type: "sine", duration: 0.08, secondFreq: 680, gain: 0.03 },
  pickup_chest: { freq: 310, type: "square", duration: 0.18, secondFreq: 470, gain: 0.05 },
  pulse: { freq: 210, type: "sawtooth", duration: 0.13, secondFreq: 300 },
  adrenaline: { freq: 640, type: "square", duration: 0.07 },
  orbit_hit: { freq: 860, type: "triangle", duration: 0.025, gain: 0.016 },
  overdrive_start: { freq: 420, type: "square", duration: 0.12, secondFreq: 620 },
  overdrive_peak: { freq: 520, type: "sawtooth", duration: 0.18, secondFreq: 840, gain: 0.055 },
  revive: { freq: 600, type: "triangle", duration: 0.2 },
};

export function createAudioEngine() {
  let ctx = null;
  let master = null;

  function ensureContext() {
    if (ctx) {
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }

    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
  }

  function unlock() {
    ensureContext();
    if (!ctx) {
      return;
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  function playOne(event) {
    if (!ctx || !master) {
      return;
    }
    if (ctx.state === "suspended") {
      return;
    }

    const profile = SOUND_PROFILE[event.type] ?? SOUND_PROFILE.hit;
    const now = ctx.currentTime;
    const duration = profile.duration * (0.85 + Math.min(1.7, event.intensity ?? 1) * 0.2);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = profile.type;
    osc.frequency.value = profile.freq * (0.92 + Math.random() * 0.16);

    gain.gain.setValueAtTime(0.0001, now);
    const peak = (profile.gain ?? 0.04) * (event.intensity ?? 1);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.01);

    if (profile.secondFreq) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = profile.type;
      osc2.frequency.value = profile.secondFreq * (0.94 + Math.random() * 0.12);
      gain2.gain.setValueAtTime(0.0001, now + 0.005);
      gain2.gain.exponentialRampToValueAtTime(peak * 0.62, now + 0.018);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(now + 0.004);
      osc2.stop(now + duration + 0.015);
    }
  }

  function playQueued(events) {
    if (!events || events.length === 0) {
      return;
    }
    ensureContext();

    const queue = [...events]
      .sort((a, b) => {
        const pA = a.priority ?? DEFAULT_PRIORITY[a.type] ?? 1;
        const pB = b.priority ?? DEFAULT_PRIORITY[b.type] ?? 1;
        return pB - pA;
      })
      .slice(0, 4);

    for (const event of queue) {
      playOne(event);
    }
  }

  return {
    playQueued,
  };
}
