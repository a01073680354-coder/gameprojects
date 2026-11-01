// The shop window: one DOM panel, dressed differently for each shop.
//   forge   철야 정비소 · THE LAST FORGE        permanent upgrades, ₵
//   supply  0번 보급함 · GHOST SUPPLY           heals and one-shot gear, ₵, per-box limits
//   bazaar  망각시장 · THE FORGOTTEN BAZAAR     forbidden mods with a price, ◈, one equipped
// Keyboard: ↑↓ to choose, Enter to buy, Esc to leave. The game is paused
// while it is open (the scene holds it).

import { WALLET } from "../sim/loadout";
import { SFX } from "../audio/sfx";

export type ShopKind = "forge" | "supply" | "bazaar";

interface Item {
  id: string;
  name: string;
  desc: string;
  cost?: string;         // a downside (bazaar)
  price: number;
  cur: "chip" | "shard";
  kind: "upgrade" | "ampoule" | "consumable" | "curse" | "message";
  limit?: number;        // per box (supply)
}

const ITEMS: Record<ShopKind, Item[]> = {
  forge: [
    { id: "edge", name: "예리한 날", desc: "일반 베기 피해량 +10%", price: 60, cur: "chip", kind: "upgrade" },
    { id: "coil", name: "자기장 코일", desc: "되받아친 탄환의 피해량 +15%", price: 70, cur: "chip", kind: "upgrade" },
    { id: "grip", name: "충격 흡수 손잡이", desc: "받는 피해 10% 감소 (열 번 맞으면 한 번은 충격을 흡수)", price: 55, cur: "chip", kind: "upgrade" },
    { id: "capacitor", name: "축전 장치", desc: "패링에 성공한 직후의 대쉬가 20% 더 멀리 뻗음", price: 85, cur: "chip", kind: "upgrade" },
    { id: "ampoule", name: "나노 앰플", desc: "회복 앰플 1개 보충", price: 20, cur: "chip", kind: "ampoule" },
  ],
  supply: [
    { id: "message", name: "서윤의 기록", desc: "보급함에 남겨진 음성 기록을 재생", price: 0, cur: "chip", kind: "message" },
    { id: "ampoule", name: "나노 앰플", desc: "회복 앰플 1개 보충 (보급함당 2개)", price: 20, cur: "chip", kind: "ampoule", limit: 2 },
    { id: "conc", name: "농축 나노 앰플", desc: "다음 회복 1회의 회복량 +2칸", price: 50, cur: "chip", kind: "consumable", limit: 1 },
    { id: "shield", name: "일회용 보호막", desc: "다음 전투에서 처음 맞는 공격 1회를 막아 줌", price: 45, cur: "chip", kind: "consumable", limit: 1 },
    { id: "battery", name: "고속 축전지", desc: "다음 전투 시작 후 8초 동안 대쉬가 즉시 재충전", price: 35, cur: "chip", kind: "consumable", limit: 1 },
  ],
  bazaar: [
    { id: "wraith", name: "망령의 칼날", desc: "베기 피해 +20%", cost: "최대 체력 1칸 감소", price: 2, cur: "shard", kind: "curse" },
    { id: "backflow", name: "역류 코어", desc: "반사탄 피해 +35%", cost: "나노 앰플 최대 보유량 -1", price: 3, cur: "shard", kind: "curse" },
    { id: "seal", name: "처형인의 인장", desc: "적의 체간 붕괴량 +25%", cost: "받는 피해 +15%", price: 3, cur: "shard", kind: "curse" },
    { id: "manual", name: "무명의 교본", desc: "퍼펙트 패링 판정 시간 +60%", cost: "최대 체력 2칸 감소", price: 4, cur: "shard", kind: "curse" },
  ],
};

const HEAD: Record<ShopKind, { name: string; en: string; owner: string; line: string }> = {
  forge: { name: "철야 정비소", en: "THE LAST FORGE", owner: "강만식", line: "“칼은 멀쩡해. 문제는 그걸 쥐고 있는 늙은이겠지.”" },
  supply: { name: "0번 보급함", en: "GHOST SUPPLY", owner: "무인 보급 장치", line: "“꼭 필요한 물건만 챙겨 가세요. 그리고… 다치지 마세요.”" },
  bazaar: { name: "망각시장", en: "THE FORGOTTEN BAZAAR", owner: "수집가", line: "“무엇을 사고 싶으십니까? 아니면… 무엇을 잊고 싶으십니까?”" },
};

export interface ShopContext {
  kind: ShopKind;
  shopId: string;
  ampoules: () => { have: number; max: number };
  /** an ampoule bought: put it in the coat */
  addAmpoule: () => void;
  /** gear changed max health / capacity */
  reapply: () => void;
  /** play this box's message; the window closes and opens again after */
  playMessage: () => Promise<void>;
  onClose: () => void;
}

class ShopUI {
  private root!: HTMLDivElement;
  private list!: HTMLDivElement;
  private wallet!: HTMLDivElement;
  private note!: HTMLDivElement;
  private ctx: ShopContext | null = null;
  private sel = 0;
  open = false;

  private build() {
    if (this.root) return;
    const r = document.createElement("div");
    r.id = "shop";
    r.hidden = true;
    r.setAttribute("role", "dialog");
    r.setAttribute("aria-modal", "true");
    r.innerHTML = `
      <div class="sh-panel">
        <header><div class="sh-en"></div><h2 class="sh-name"></h2><div class="sh-owner"></div><p class="sh-line"></p></header>
        <div class="sh-list" role="listbox"></div>
        <div class="sh-note" aria-live="polite"></div>
        <footer><div class="sh-wallet"></div><button type="button" class="sh-close">나가기 <span>Esc</span></button></footer>
        <p class="sh-keys">↑↓ 고르기 · Enter 구매 · Esc 나가기</p>
      </div>`;
    document.body.appendChild(r);
    this.root = r;
    this.list = r.querySelector(".sh-list")!;
    this.wallet = r.querySelector(".sh-wallet")!;
    this.note = r.querySelector(".sh-note")!;
    r.querySelector(".sh-close")!.addEventListener("click", () => this.close());
    r.addEventListener("pointerdown", (e) => e.stopPropagation());
    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      const items = ITEMS[this.ctx!.kind];
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
      if (e.code === "ArrowUp" || e.code === "KeyW") { this.sel = (this.sel + items.length - 1) % items.length; this.render(); }
      else if (e.code === "ArrowDown" || e.code === "KeyS") { this.sel = (this.sel + 1) % items.length; this.render(); }
      else if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") { if (!e.repeat) this.buy(items[this.sel]); }
      if (e.code !== "Tab" && e.code !== "KeyM") { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  show(ctx: ShopContext) {
    this.build();
    this.ctx = ctx;
    this.open = true;
    this.sel = 0;
    const h = HEAD[ctx.kind];
    this.root.dataset.kind = ctx.kind;
    (this.root.querySelector(".sh-en") as HTMLElement).textContent = h.en;
    (this.root.querySelector(".sh-name") as HTMLElement).textContent = h.name;
    (this.root.querySelector(".sh-owner") as HTMLElement).textContent = h.owner;
    (this.root.querySelector(".sh-line") as HTMLElement).textContent = h.line;
    this.note.textContent = ctx.kind === "bazaar" ? "여기 물건은 강하지만 대가가 따릅니다. 한 번에 하나만 장착할 수 있고, 산 물건은 여기서 바꿔 낄 수 있어요." : "";
    this.root.hidden = false;
    this.render();
    SFX.storyCue("beep");
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    const c = this.ctx;
    this.ctx = null;
    c?.onClose();
  }

  private count(it: Item) { return WALLET.bought[`${this.ctx!.shopId}:${it.id}`] ?? 0; }

  /** Why an item can't be bought right now (or null). */
  private blocked(it: Item): string | null {
    const c = this.ctx!;
    if (it.kind === "message") return null;
    if (it.kind === "upgrade" && WALLET.owned.has(it.id)) return "보유 중";
    if (it.kind === "curse" && WALLET.curses.has(it.id)) return WALLET.curse === it.id ? "장착 중" : null;
    if (it.limit !== undefined && this.count(it) >= it.limit) return "품절";
    if (it.kind === "ampoule") { const a = c.ampoules(); if (a.have >= a.max) return "가득 참"; }
    const have = it.cur === "chip" ? WALLET.chips : WALLET.shards;
    if (have < it.price) return it.cur === "chip" ? "칩 부족" : "파편 부족";
    return null;
  }

  private label(it: Item) {
    if (it.kind === "message") return "재생";
    if (it.kind === "curse" && WALLET.curses.has(it.id)) return WALLET.curse === it.id ? "해제" : "장착";
    return it.cur === "chip" ? `${it.price}₵` : `◈ ${it.price}`;
  }

  private render() {
    const c = this.ctx!;
    const items = ITEMS[c.kind];
    this.list.innerHTML = "";
    items.forEach((it, i) => {
      const why = this.blocked(it);
      const curseOn = it.kind === "curse" && WALLET.curse === it.id;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sh-item" + (i === this.sel ? " sel" : "") + (why && !curseOn ? " off" : "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(i === this.sel));
      const left = it.limit !== undefined ? ` · 남은 ${Math.max(0, it.limit - this.count(it))}` : "";
      row.innerHTML = `<span class="sh-n">${it.name}</span><span class="sh-p">${curseOn ? "해제" : why ?? this.label(it)}</span>
        <span class="sh-d">${it.desc}${left}</span>${it.cost ? `<span class="sh-c">대가: ${it.cost}</span>` : ""}`;
      row.addEventListener("mouseenter", () => { if (this.sel !== i) { this.sel = i; this.render(); } });
      row.addEventListener("click", () => { this.sel = i; this.buy(it); });
      this.list.appendChild(row);
    });
    const a = c.ampoules();
    this.wallet.innerHTML = `<b>${WALLET.chips}</b>₵ <span>폐회로 칩</span> · <b>◈ ${WALLET.shards}</b> <span>기억 파편</span> · 앰플 ${a.have}/${a.max}` +
      (WALLET.concentrated || WALLET.shields || WALLET.batteries ? ` · 휴대: ${[WALLET.concentrated ? `농축 ${WALLET.concentrated}` : "", WALLET.shields ? `보호막 ${WALLET.shields}` : "", WALLET.batteries ? `축전지 ${WALLET.batteries}` : ""].filter(Boolean).join(", ")}` : "");
    (this.list.children[this.sel] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }

  private async buy(it: Item) {
    const c = this.ctx!;
    if (it.kind === "message") {
      this.root.hidden = true;
      this.open = false;
      await c.playMessage();
      this.open = true;
      this.root.hidden = false;
      this.render();
      return;
    }
    // bazaar: swap what is worn
    if (it.kind === "curse" && WALLET.curses.has(it.id)) {
      WALLET.curse = WALLET.curse === it.id ? null : it.id;
      c.reapply();
      SFX.storyCue("tapeIn"); SFX.tapeHiss(false);
      this.note.textContent = WALLET.curse ? `${it.name}을(를) 장착했습니다.` : "장착을 해제했습니다.";
      this.render();
      return;
    }
    const why = this.blocked(it);
    if (why) { SFX.storyCue("deny"); this.note.textContent = why === "칩 부족" ? "폐회로 칩이 모자랍니다." : why === "파편 부족" ? "기억 파편이 모자랍니다." : `${it.name}: ${why}`; return; }
    if (it.cur === "chip") WALLET.chips -= it.price; else WALLET.shards -= it.price;
    WALLET.bought[`${c.shopId}:${it.id}`] = this.count(it) + 1;
    switch (it.kind) {
      case "upgrade": WALLET.owned.add(it.id); break;
      case "ampoule": c.addAmpoule(); break;
      case "consumable":
        if (it.id === "conc") WALLET.concentrated++;
        if (it.id === "shield") WALLET.shields++;
        if (it.id === "battery") WALLET.batteries++;
        break;
      case "curse": WALLET.curses.add(it.id); WALLET.curse = it.id; break;
    }
    c.reapply();
    SFX.heal("gain");
    this.note.textContent = it.kind === "curse" ? `${it.name}을(를) 장착했습니다. 대가: ${it.cost}.` : `${it.name} 구입.`;
    this.render();
  }
}

export const SHOP_UI = new ShopUI();
