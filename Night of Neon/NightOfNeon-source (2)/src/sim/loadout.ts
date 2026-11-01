// What the hero carries between shops and stages: money, upgrades, the one
// forbidden mod he has bolted on, and the consumables in his coat.
//   ₵ scrap chips   from enemies; spent at the Last Forge and Ghost Supply
//   ◈ memory shards from bosses and hidden places; spent at the Forgotten Bazaar
// Kept for the whole session (page load), like PROGRESS.
// Rule of thumb: upgrades may make parrying easier or more rewarding, never
// unnecessary.

export const WALLET = {
  chips: 0,
  shards: 0,
  owned: new Set<string>(),          // permanent Forge upgrades
  curses: new Set<string>(),         // Bazaar mods bought
  curse: null as string | null,      // the one equipped
  concentrated: 0,                   // next heals restore more
  shields: 0,                        // carried; one comes up at the next fight
  batteries: 0,                      // carried; one fires at the next fight
  bought: {} as Record<string, number>, // per-shop purchase counts ("shopId:item")
  shardsTaken: new Set<string>(),
  visited: new Set<string>(),        // shops whose greeting has played
  // damage banks: fractional reductions / increases paid out as whole hits
  gripBank: 0,
  sealBank: 0,
};

/** Chips dropped per kill. */
export const BOUNTY: Record<string, number> = {
  rifle: 6, burst: 8, blade: 8, drone: 7, kamikaze: 5, turret: 7, heavy: 25, boss: 60, collector: 6, burner: 7,
};

const has = (k: string) => WALLET.owned.has(k);
const curse = (k: string) => WALLET.curse === k;

/** Multipliers and deltas the simulation reads. */
export const MOD = {
  slash: () => (has("edge") ? 1.1 : 1) * (curse("wraith") ? 1.2 : 1),
  reflect: () => (has("coil") ? 1.15 : 1) * (curse("backflow") ? 1.35 : 1),
  posture: () => (curse("seal") ? 1.25 : 1),
  perfect: () => (curse("manual") ? 1.6 : 1),
  maxHp: () => (curse("wraith") ? -1 : 0) + (curse("manual") ? -2 : 0),
  ampoules: () => (curse("backflow") ? -1 : 0),
  dashBoost: () => (has("capacitor") ? 1.2 : 1),
};

/**
 * Damage the hero takes from one hit (normally 1), after the grip (-10%,
 * banked: every tenth hit is absorbed) and the seal (+15%, banked).
 */
export function damageTaken(): { dmg: number; absorbed: boolean; extra: boolean } {
  let dmg = 1, absorbed = false, extra = false;
  if (has("grip")) {
    WALLET.gripBank += 10;            // percent, kept whole to avoid float drift
    if (WALLET.gripBank >= 100) { WALLET.gripBank -= 100; dmg = 0; absorbed = true; }
  }
  if (curse("seal") && dmg > 0) {
    WALLET.sealBank += 15;
    if (WALLET.sealBank >= 100) { WALLET.sealBank -= 100; dmg = 2; extra = true; }
  }
  return { dmg, absorbed, extra };
}
