export type Owner = "enemy" | "player";

let nextId = 1;

export class Bullet {
  id = nextId++;
  alive = true;
  age = 0;
  perfect = false;
  pierce = 0;
  damage = 1;
  reflected = false;
  heldTimer = -1; // >0: steps left before a held hit on the player lands (late-parry grace)
  hitIds = new Set<number>();
  trail: { x: number; y: number }[] = [];
  cinematic = false;
  kind: "normal" | "heavy" | "orb" | "wave" | "missile" = "normal";
  radius = 2;
  grazed = false;
  clanked = false;
  melee = false;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public owner: Owner,
    public shooterId = 0,
  ) {}

  get speed() { return Math.hypot(this.vx, this.vy); }
}
