// Input collected from DOM events and handed to the fixed-step simulation.
// Presses are latched until a simulation step consumes them, so a tap that
// starts and ends between two steps is never lost.

export interface InputFrame {
  x: number; // -1, 0, 1
  y: number; // -1 up, 1 down
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
  parryPressed: boolean;
  slashPressed?: boolean;
  healPressed?: boolean;
  aimX: number; // world-space mouse position
  aimY: number;
}

const KEYMAP: Record<string, string> = {
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  Space: "jump", KeyK: "jump",
  ShiftLeft: "dash", ShiftRight: "dash", KeyL: "dash",
  KeyJ: "parry",
  KeyU: "slash",
  KeyR: "heal",
};

export class Input {
  held = new Set<string>();
  latched = new Set<string>();
  lastHoriz = 0; // last-pressed wins when both left and right are held
  mouseScreenX = 0;
  mouseScreenY = 0;
  locked = false; // cutscenes: ignore gameplay input
  onKey: ((code: string) => void) | null = null;

  private off: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(t: Window | HTMLElement, type: K, fn: (e: any) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.off.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(window, "keydown", (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!this.held.has(a)) this.latched.add(a);
        this.held.add(a);
        if (a === "left") this.lastHoriz = -1;
        if (a === "right") this.lastHoriz = 1;
      }
      if (e.code === "Tab" || e.code === "F1" || e.code === "Backquote") e.preventDefault();
      if (!e.repeat && this.onKey) this.onKey(e.code);
    });
    on(window, "keyup", (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (a) this.held.delete(a);
    });
    on(window, "blur", () => this.held.clear());
    on(canvas, "contextmenu", (e: Event) => e.preventDefault());
    on(canvas, "pointerdown", (e: PointerEvent) => {
      if (e.button === 2) this.latched.add("parry");
      if (e.button === 0) this.latched.add("slash");
      canvas.focus();
    });
    on(canvas, "pointermove", (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.mouseScreenX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseScreenY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
  }

  /** Detach from the page (scene restart / next stage). */
  destroy() {
    for (const f of this.off) f();
    this.off = [];
    this.onKey = null;
  }

  /** Build the input for one simulation step and clear consumed presses. */
  frame(toWorld: (sx: number, sy: number) => { x: number; y: number }): InputFrame {
    const w = toWorld(this.mouseScreenX, this.mouseScreenY);
    if (this.locked) {
      this.latched.clear();
      return { x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, slashPressed: false, healPressed: false, aimX: w.x, aimY: w.y };
    }
    const L = this.held.has("left"), R = this.held.has("right");
    let x = 0;
    if (L && R) x = this.lastHoriz;
    else if (L) x = -1;
    else if (R) x = 1;
    const U = this.held.has("up"), D = this.held.has("down");
    const y = U && !D ? -1 : D && !U ? 1 : 0;
    const f: InputFrame = {
      x, y,
      jumpPressed: this.latched.has("jump"),
      jumpHeld: this.held.has("jump"),
      dashPressed: this.latched.has("dash"),
      parryPressed: this.latched.has("parry"),
      slashPressed: this.latched.has("slash"),
      healPressed: this.latched.has("heal"),
      aimX: w.x,
      aimY: w.y,
    };
    this.latched.clear();
    return f;
  }
}
