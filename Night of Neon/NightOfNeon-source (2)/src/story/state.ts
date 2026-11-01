// Story state (bible v3, p.31): the decisions that change later scenes.
// Only what the player decides is stored; anything that follows from those
// decisions (the bridge ceasefire) is worked out by rule, never saved.

export type WardChoice = "keep" | "cut_control";
export type PowerChoice = "keep" | "cancel" | "split";
export type EdenChoice = "close" | "open_doors" | "keep";
export type FinalChoice = "cut" | "maintain" | "leave";

export interface Choices {
  /** STAGE 1: the hero lets the recovery chief go. Always true once stage 1 is cleared. */
  seungho_spared: boolean | null;
  /** STAGE 5: the copy of the Red Moon ledger was taken from the offline vault. */
  proof_archive: boolean | null;
  ward_choice: WardChoice | null;
  power_choice: PowerChoice | null;
  eden_choice: EdenChoice | null;
  jinhyuk_alive: boolean | null;
  muyeong_alive: boolean | null;
  /** STAGE 10: the evidence was handed over for the independents to spread. */
  evidence_shared: boolean | null;
  final_choice: FinalChoice | null;
}

export const CHOICE_KEYS: (keyof Choices)[] = [
  "seungho_spared", "proof_archive", "ward_choice", "power_choice", "eden_choice",
  "jinhyuk_alive", "muyeong_alive", "evidence_shared", "final_choice",
];

/** Values each decision can take (for the Tab menu and the branch checks). */
export const CHOICE_VALUES: Record<keyof Choices, (string | boolean)[]> = {
  seungho_spared: [true],
  proof_archive: [true, false],
  ward_choice: ["keep", "cut_control"],
  power_choice: ["keep", "cancel", "split"],
  eden_choice: ["close", "open_doors", "keep"],
  jinhyuk_alive: [true, false],
  muyeong_alive: [true, false],
  evidence_shared: [true, false],
  final_choice: ["cut", "maintain", "leave"],
};

export function emptyChoices(): Choices {
  return {
    seungho_spared: null, proof_archive: null, ward_choice: null, power_choice: null,
    eden_choice: null, jinhyuk_alive: null, muyeong_alive: null, evidence_shared: null, final_choice: null,
  };
}

/** The live decisions of this playthrough. */
export const CHOICES: Choices = emptyChoices();

/**
 * bridge_ceasefire (bible p.32): never true just because Kang Mu-yeong lives.
 * It needs him alive, the ledger in hand, and the evidence handed over.
 */
export function bridgeCeasefire(c: Choices = CHOICES): boolean {
  return c.muyeong_alive === true && c.proof_archive === true && c.evidence_shared === true;
}
