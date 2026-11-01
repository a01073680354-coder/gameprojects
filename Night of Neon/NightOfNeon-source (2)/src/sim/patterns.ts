// Data-driven bullet patterns (a small BulletML-style vocabulary).
// A pattern is a list of volleys fired at time offsets after the trigger.

export type BulletKind = "normal" | "heavy" | "orb" | "wave" | "missile";

export interface Volley {
  at: number;        // seconds after the pattern starts
  count: number;     // bullets in this volley
  spread: number;    // total fan in degrees (360 = full ring)
  aimed: boolean;    // centred on the shooter's aim, else on `base`
  base?: number;     // degrees, used when not aimed
  rotate?: number;   // extra degrees added per volley index (spirals)
  speed: number;     // multiplier on the bullet speed setting
  kind: BulletKind;
}

export interface Pattern {
  volleys: Volley[];
  danger: boolean;   // contains bullets that cannot be parried
}

const v = (o: Partial<Volley> & { at: number }): Volley => ({
  count: 1, spread: 0, aimed: true, speed: 1, kind: "normal", ...o,
});

export const PATTERNS: Record<string, Pattern> = {
  single: { danger: false, volleys: [v({ at: 0 })] },
  burst3: { danger: false, volleys: [v({ at: 0, speed: 1.1 }), v({ at: 0.19, speed: 1.1 }), v({ at: 0.38, speed: 1.1 })] },
  spread3: { danger: false, volleys: [v({ at: 0, count: 3, spread: 28 })] },
  // heavy gunner: an unparryable slug, then a parryable fan to punish the dodge
  slug: { danger: true, volleys: [v({ at: 0, kind: "heavy", speed: 0.85 })] },
  slugFan: {
    danger: true,
    volleys: [v({ at: 0, kind: "heavy", speed: 0.85 }), v({ at: 0.55, count: 3, spread: 26, speed: 1.05 })],
  },
  // drone patterns
  orbPair: { danger: false, volleys: [v({ at: 0, count: 2, spread: 36, kind: "orb", speed: 0.55 })] },
  ring8: { danger: false, volleys: [v({ at: 0, count: 8, spread: 360, aimed: true, speed: 0.7 })] },
  spiral: {
    danger: false,
    volleys: [0, 1, 2, 3, 4, 5].map((i) => v({ at: i * 0.13, count: 3, spread: 360, aimed: false, base: 0, rotate: 22, speed: 0.75 })),
  },
};

/** Angles (radians) for one volley. */
export function volleyAngles(vol: Volley, index: number, aim: number): number[] {
  const base = (vol.aimed ? aim : ((vol.base ?? 0) * Math.PI) / 180) + (((vol.rotate ?? 0) * index) * Math.PI) / 180;
  const out: number[] = [];
  const n = vol.count;
  if (n === 1) return [base];
  const spread = (vol.spread * Math.PI) / 180;
  const full = vol.spread >= 360;
  for (let i = 0; i < n; i++) {
    const t = full ? i / n : i / (n - 1) - 0.5;
    out.push(base + spread * t);
  }
  return out;
}

export const BULLET_RADIUS: Record<BulletKind, number> = { normal: 2, heavy: 4, orb: 5, wave: 7, missile: 4 };
