// NIGHT OF NEON: every line of story text lives here, so the story can be
// rewritten without touching the game code.
//
// Setting (story bible v3): 2189, the city of 흑안 under the 백야 group.
// NULL PROTOCOL erases people from records and from the memories of everyone
// wired to the network. 백도진 (72), once the nameless executioner 무명검,
// never took the implant, so he still remembers his vanished daughter 백서윤.
// Story order (src/story/manifest.ts): prologue, STAGE 1 the outskirts
// (internal id 11), STAGE 2 the market (not built yet), STAGE 3 the rooftops
// (id 1), STAGE 4 the Spire (id 2), STAGE 5 the archive (id 3). Keys keep the
// internal ids: "s11-..." lines belong to STAGE 1, "s1-..." to the rooftops.

export type Speaker = "narr" | "doj" | "oni" | "seo" | "sys" | "radio" | "pa" | "ad" | "null" | "arc" | "rec" | "kang" | "col" | "squad" | "cha" | "nbr" | "term" | "note"
  | "vendor" | "queue" | "chalk" | "kid" | "hider" | "youth" | "scan" | "search" | "kangr" | "bul";

export const SPEAKERS: Record<Speaker, { name: string; color: string; tag?: string }> = {
  narr: { name: "", color: "#d8d2f0" },
  doj: { name: "백도진", color: "#9ffcff" },
  oni: { name: "홍귀", color: "#ff6f91" },
  seo: { name: "백서윤", color: "#ffd37a", tag: "녹음" },
  sys: { name: "백야 시스템", color: "#b8c8ff" },
  radio: { name: "수색대", color: "#ffb347", tag: "무전" },
  pa: { name: "보관탑", color: "#8fe8ff", tag: "방송" },
  ad: { name: "백야 그룹", color: "#f9f871", tag: "광고" },
  null: { name: "NULL-00", color: "#d0a8ff" },
  arc: { name: "기록관", color: "#e8dcb8" },
  rec: { name: "삭제 기록", color: "#9ffcff", tag: "열람" },
  kang: { name: "강만식", color: "#ffb36b" },
  col: { name: "수집가", color: "#c9a2ff" },
  squad: { name: "회수반", color: "#ffb347", tag: "무전" },
  cha: { name: "차승호", color: "#ffcf7a" },
  nbr: { name: "이웃 할머니", color: "#d8c8a8" },
  term: { name: "조회 단말", color: "#b8c8ff" },
  note: { name: "서윤의 글씨", color: "#ffd37a", tag: "메모" },
  // STAGE 2: the market
  vendor: { name: "상인", color: "#e8c890" },
  queue: { name: "줄 선 사람", color: "#c8c0b0" },
  chalk: { name: "분필 든 여자", color: "#e8e0d0" },
  kid: { name: "아이", color: "#ffe2a8" },
  hider: { name: "상점 아주머니", color: "#f0b890" },
  youth: { name: "청년", color: "#b8c8d8" },
  scan: { name: "라플라스", color: "#6ad8c8", tag: "예측 치안" },
  search: { name: "백야 수색대", color: "#ff8a6a", tag: "방송" },
  kangr: { name: "강만식", color: "#ffb36b", tag: "무전" },
  bul: { name: "방벽", color: "#ffd060", tag: "원격 장갑" },
};

export interface Line {
  who: Speaker;
  text: string;
  /** bark only: wait this long after the previous line (s) */
  delay?: number;
}

const L = (who: Speaker, text: string, delay?: number): Line => ({ who, text, delay });

// ------------------------------------------------------------------ prologue

export type Shot = "black" | "city" | "phone" | "terminal" | "photo" | "recorder" | "sword";

export interface PrologueStep {
  shot: Shot;
  line?: Line;
  /** terminal / overlay text shown on screen (not a spoken line) */
  ui?: string[];
  /** a big title card instead of a subtitle */
  card?: { big: string; small?: string };
  /** minimum time on screen (s); lines also wait for their reading time */
  hold?: number;
  /** a sound cue when the step starts */
  cue?: "thunder" | "beep" | "deny" | "tapeIn" | "tapeOut" | "tapeCut" | "unsheathe" | "ring";
}

// Bible v3, P-01 and P-02 (and appendix 01). The prologue does not explain
// NULL PROTOCOL: it shows an empty record next to a father who remembers.
// It ends in the house; STAGE 1 begins upstairs in the same house.
const TERM = (last: string[]) => ["흑안시 시민 기록 조회", "", "> 이름: 백서윤", ...last];
export const PROLOGUE: PrologueStep[] = [
  { shot: "black", hold: 1.4 },
  { shot: "city", line: L("narr", "서기 2189년. 흑안시(黑眼市)."), hold: 3.2 },
  { shot: "city", line: L("narr", "이 도시의 이름과 기록은 전부 한곳에 모인다. 백야(白夜) 그룹의 네트워크.") },
  { shot: "city", line: L("narr", "사람들의 머릿속에도, 그 네트워크에 닿는 작은 장치가 하나씩 들어 있다."), cue: "thunder" },

  { shot: "phone", line: L("narr", "도시의 끝, 비가 새는 외곽의 작은 집."), ui: ["발신 중", "서윤", "· · ·"], hold: 2.6, cue: "ring" },
  { shot: "phone", ui: ["발신 중", "서윤", "· · ·"], hold: 2.2, cue: "ring" },
  { shot: "phone", ui: ["", "", "연결할 수 없는 번호입니다"], line: L("doj", "……"), cue: "deny" },

  { shot: "terminal", ui: TERM(["> 조회 중 ·  ·  ·"]), hold: 2.2, cue: "beep" },
  { shot: "terminal", ui: TERM(["> 조회 가능한 정보가 없습니다"]), line: L("term", "백서윤. 조회 가능한 정보가 없습니다."), cue: "deny" },
  { shot: "terminal", ui: TERM(["> 조회 가능한 정보가 없습니다"]), line: L("doj", "한 번 더.") },
  { shot: "terminal", ui: TERM(["> 해당 시민은 존재하지 않습니다"]), line: L("term", "해당 시민은 존재하지 않습니다."), cue: "deny" },
  { shot: "terminal", ui: TERM(["> 해당 시민은 존재하지 않습니다"]), line: L("doj", "…내가 어제도 그 아이 목소리를 들었는데.") },

  { shot: "photo", line: L("narr", "함께 찍은 사진의 이름표에는, 빈칸만 남아 있었다."), hold: 3.4 },
  { shot: "photo", line: L("doj", "기록이 없다고… 사람이 없던 게 되나.") },
  { shot: "photo", line: L("narr", "그는 평생 그 장치를 거부해 왔다. 그래서 그의 머릿속만은, 아무도 고쳐 쓰지 못했다.") },

  { shot: "recorder", line: L("narr", "며칠 뒤. 문 앞에 낡은 녹음기 하나가 놓여 있었다. 네트워크에 닿지 않는 물건이었다."), hold: 3.4 },
  { shot: "recorder", line: L("narr", "뒷면에는 손톱으로 그은 작은 달. 서윤이 월흔의 칼집에도 새겨 둔 표식이었다.") },
  { shot: "recorder", line: L("seo", "아버지. 이걸 듣고 계신다면, 저는 이미 붙잡혔을 거예요."), cue: "tapeIn" },
  { shot: "recorder", line: L("seo", "절 찾으러 오지 마세요.") },
  { shot: "recorder", line: L("seo", "…그래도 오신다면, 이 좌표를 따라오세요.") },
  { shot: "recorder", line: L("seo", "다른 사람들의 기록도… 제 것도, 전부 거기 있어요.") },
  { shot: "recorder", ui: ["좌표 수신", "흑안시 중앙구 · NEON SPIRE", "백야 그룹 중앙 기억 보관탑"], hold: 3.6, cue: "tapeCut" },

  { shot: "sword", line: L("narr", "그는 오랫동안 꺼내지 않았던 검을 꺼냈다."), hold: 3.0 },
  { shot: "sword", line: L("doj", "오랜만이구나, 월흔(月痕)."), cue: "unsheathe" },
  { shot: "sword", line: L("doj", "기다려라, 서윤아.") },
  { shot: "black", hold: 0.8 },
  { shot: "black", card: { big: "NIGHT OF NEON", small: "네 온 의 밤" }, hold: 3.2, cue: "thunder" },
  { shot: "black", hold: 0.8 },
];

// ------------------------------------------------------------- cutscenes

/** Stops the game; one line per click. */
export const SCENES: Record<string, Line[]> = {
  // ---- STAGE 2 · the undercity market (internal id 12)
  "m-ration": [
    L("narr", "손으로 고쳐 쓴 전력 배급표. 구역마다 전기가 들어오는 시간이 적혀 있다."),
    L("rec", "하층 3구역 · 22:00–24:00 · 병원 우선 배정으로 오늘 2시간 단축 — 하층 전력 관리국 권하린"),
    L("queue", "단축이래. 또."),
  ],
  // (bible 2-02) he writes her name where people write the names of the erased
  "w-namewall": [
    L("narr", "벽에는 분필로 쓴 이름이 빼곡했다. 쓴 사람도, 그 이름의 주인도 이제는 기억하지 못하는 이름들."),
    L("narr", "도진은 바닥에 떨어진 분필을 주워, 빈 곳에 천천히 적었다."),
    L("doj", "백. 서. 윤."),
  ],
  // appendix 02: the child
  "w-namewall-kid": [
    L("kid", "아저씨, 그 이름은 누구예요?"),
    L("doj", "내 딸이다."),
    L("kid", "왜 벽에 적어요?"),
    L("doj", "누가 다시 지울까 봐."),
    L("kid", "그럼 저도 기억할게요."),
  ],
  "w-namewall-again": [L("narr", "백서윤. 분필 자국이 아직 선명하다.")],
  "m-bazaar": [
    L("narr", "보랏빛 표식이 그려진 셔터. 두드려도 대답이 없다. 셔터에는 '망각시장 · 휴업'이라고만 적혀 있다."),
    L("kang", "그 셔터는 두드려 봐야 소용없어. 수집가는 손님을 직접 고르거든."),
  ],
  // (bible 2-04) after the first visit to the forge
  "s12-kang-after": [
    L("kang", "그 몸으로 보관탑까지 가겠다고? …하긴, 말린다고 들을 사람이 아니지."),
    L("kang", "지상으로는 못 가. 시장 끝 고가 밑 공터에 화물 승강기가 있어. 그걸 타면 옥상이야."),
    L("kang", "옥상 위 정비 시설엔 내가 직접 못 가. 필요한 건 배달 드론으로 보내 주지."),
    L("kang", "그리고… 류건이 놈, 요즘 처형부대를 맡아 홍귀라 불린다더군."),
    L("doj", "그 아이가…"),
    L("kang", "무영이는 아직 하층 어딘가에서 칼을 들고 있겠지. 셋이 다 살아 있는 게 용하다, 용해."),
  ],
  "s12-bul-intro": [
    L("search", "원격 진압 장갑 '방벽' 기동. 화물 승강기 구역을 봉쇄합니다."),
    L("doj", "…사람이 타고 있지 않군."),
    L("bul", "표적 확인. 진압탄 장전."),
  ],
  "s12-bul-down": [
    L("bul", "원격 신호… 소실."),
    L("narr", "방벽이 주저앉자, 화물 승강기의 잠금이 풀렸다."),
    L("kangr", "도진, 듣고 있나? 지상은 전부 눈이야. 가려면 옥상으로 가."),
    L("doj", "알고 있다."),
    L("kangr", "…살아서 돌아와. 칼값은 아직 다 안 받았으니까."),
  ],
  // ---- STAGE 1 · the outskirts (internal id 11). Things in the house, read with W.
  "n-bench": [
    L("narr", "서윤의 작업대. 가장자리가 까맣게 그을려 있다."),
    L("doj", "…여길 또 태웠군."),
    L("note", "월흔 편향 장치: 금속 탄에만 작동함. 고에너지(보라색)는 휘지 않음 → 피할 것."),
    L("note", "패링 충격은 축전기로. 대쉬 재충전에 씀."),
  ],
  "n-ampoule": [
    L("narr", "약상자 뚜껑에 꾹꾹 눌러 쓴 글씨. ‘아버지 비상용’."),
    L("doj", "언제 이런 걸 다 만들어 뒀나."),
  ],
  "n-photo": [
    L("narr", "오래된 사진. 젊은 도진 곁에 두 남자가 서 있다. 하나는 정비 공구를 들었고, 다른 하나는 두 팔이 멀쩡하다."),
    L("doj", "……"),
    L("narr", "도진은 사진을 액자에서 빼어 품에 넣었다."),
  ],
  "n-note": [
    L("narr", "냉장고 문에 붙은 오래된 쪽지."),
    L("note", "장치에 문제가 생기면 만식 아저씨를 찾아가세요."),
  ],
  "n-report": [
    L("narr", "현관 안쪽에 붙은 회수부대 서류."),
    L("rec", "회수 구역 · 출입 금지. 대상자가 존재하지 않는 경우 잔여 물건 일체 회수 후 소각."),
    L("doj", "존재하지 않는 사람의 물건을… 태우러 왔다."),
  ],
  "n-notebook": [
    L("narr", "불 속에서 건진 노트. 모서리가 탔지만 글씨는 남아 있다."),
    L("note", "아빠, 보라색은 꼭 피하세요. 점프든 대쉬든. 칼로 막으려고 하지 말고요!"),
    L("doj", "…알았다, 알았어."),
  ],
  "n-terminal": [
    L("narr", "하층 주민들이 몰래 이어 둔 비상 단말. 화면 옆에 낙서가 있다."),
    L("rec", "여기서는 잊지 않는다."),
    L("doj", "…고맙군."),
  ],
  "s11-cha-intro": [
    L("cha", "백도진 씨. 회수 작업을 방해하면 곤란합니다."),
    L("doj", "그 상자들, 내 딸의 물건이다."),
    L("cha", "딸이라니요. 그 집엔 노인 혼자 산다고 돼 있소."),
    L("doj", "그 아이 이름은 서윤이다."),
    L("cha", "그런 이름은… 목록에 없소. 비켜 주시오. 나도 시키는 일을 할 뿐이오."),
  ],
  "s11-cha-down": [
    L("narr", "월흔은 차승호를 베지 않았다. 경봉과 소각기의 호스만이 바닥에 떨어졌다."),
    L("cha", "명령이었소. 난 그 여자를… 정말로 기억 못 해요."),
    L("doj", "그 아이 이름은 서윤이다. 기억해 둬라."),
    L("cha", "…기억해도 내일이면 장치가 지울 거요."),
    L("doj", "그럼 오늘이라도 기억해라."),
    L("cha", "…회수품은 전부 보관탑으로 가오. 상자도, 사진도. 나도 그 이상은 모르오."),
    L("narr", "멀리서 경보가 울렸다. 지상의 감시망이 이미 그의 얼굴을 띄우고 있었다."),
    L("doj", "하층으로 간다. 만식이라면… 이 칼도, 이 늙은 몸도 손봐 주겠지."),
  ],
  "s1-oni-intro": [
    L("oni", "오래 기다렸습니다, 스승님."),
    L("doj", "그 가면… 류건이냐."),
    L("oni", "이제 그 이름으로 부르는 사람은 없습니다."),
    L("doj", "서윤이는 어디 있나."),
    L("oni", "그 아이를 구할 자격이 있다고 생각하십니까?"),
    L("oni", "당신이 지운 사람들은… 누가 구했습니까?"),
  ],
  "s1-oni-down": [
    L("doj", "서윤이는 살아 있나."),
    L("oni", "…살아 있습니다. 하지만 스승님…"),
    L("oni", "그 아이가 그곳에 있는 건 우연이 아닙니다."),
    L("oni", "당신을… 기다리고 있는 겁니다."),
    L("narr", "홍귀는 더 이상 대답하지 않았다."),
    L("doj", "……쉬어라, 류건."),
  ],
  "s2-null-intro": [
    L("sys", "실험체 NULL-00 기동. 신경 동기화 100%."),
    L("sys", "명령: 침입자 제거."),
    L("doj", "…눈이 비어 있군."),
    L("null", "명령. 수행."),
    L("doj", "이름도, 지난날도 없는 놈인가. 저들이 다 가져갔나 보구나."),
  ],
  // shops: greetings (first visit) and the Ghost Supply's messages
  // (bible 2-04) the first time, in the market
  "shop-forge": [
    L("kang", "누군가 했더니… 도진이 아닌가! 살아 있었구만, 이 영감탱이!"),
    L("narr", "강만식은 반가운 얼굴로 다가오다가, 칼집에 눈이 닿자 잠깐 말을 멈췄다."),
    L("kang", "…그 칼을 다시 꺼냈군."),
    L("doj", "손볼 수 있겠나?"),
    L("kang", "칼은 멀쩡해. 손볼 건 자네 몸이지. 칩만 가져와."),
  ],
  // (bible 2-03) it reads his face and the sword's signal, not an implant
  "shop-supply": [
    L("narr", "낡은 판매기였다. 접속 장치를 요구하는 대신, 화면이 그의 얼굴 윤곽과 월흔의 신호를 읽었다."),
    L("narr", "화면 구석에서 녹음 표시가 깜빡였다. 접속도, 대답도 없는 오래된 목소리였다."),
    L("seo", "아버지가 이걸 듣고 계시면… 제가 직접 말씀드릴 수 없는 상황이라는 뜻이겠죠."),
    L("seo", "적한테서 뜯어 낸 부품은 여기 넣으세요. 앰플이랑 보호막은 제가 미리 채워 놨어요."),
    L("seo", "모자란 건 만식 아저씨가 이어서 채워 주실 거예요. …그리고, 다치지 마세요."),
    L("doj", "…언제 이런 걸 다 준비해 뒀느냐, 서윤아."),
  ],
  "shop-bazaar": [
    L("col", "오래된 검의 냄새가 나는군요."),
    L("doj", "물건만 보여라."),
    L("col", "성급하시군요, 무명검."),
    L("doj", "그 이름을 어디서 들었지?"),
    L("col", "당신이 지웠던 사람들에게서요."),
    L("doj", "……"),
    L("col", "이곳의 값은 칩이 아닙니다. 사람들이 잊은 기억, 기억 파편으로 치르시지요."),
    L("col", "자, 무엇을 사고 싶으십니까? 아니면… 무엇을 잊고 싶으십니까?"),
  ],
  "supply-12": [L("seo", "아버지, 칩은 아끼지 마세요. 아끼다가 다치시면 그게 더 손해예요.")],
  "supply-1": [L("seo", "아버지, 나노 앰플은 한꺼번에 쓰지 마세요. 또 무리하실 거잖아요.")],
  "supply-2": [L("seo", "이 탑에서 이상한 기록을 발견했어요. 백야 그룹은… 우리가 생각한 것보다 훨씬 많은 사람을 지웠어요.")],
  "supply-3": [L("seo", "아버지에 관한 기록도 봤어요. 무슨 일이 있었는지 알고 싶어요."), L("seo", "…기록 말고, 아버지한테 직접 듣고 싶어요.")],
  "s3-truth": [
    L("sys", "작전 기록 열람. 작전명 적월(赤月). 2164년."),
    L("rec", "대상: 윤재하, 한서경 부부. 기억 보관 시스템 설계자. 사유: 영점 프로토콜 공개 시도."),
    L("rec", "집행자: 무명검. 백도진."),
    L("rec", "결과: 대상 2명 처리. 생존자 여아 1명, 윤서윤(2세). 집행자가 아이를 데리고 이탈. 회수 실패."),
    L("doj", "……"),
    L("doj", "서윤아. 너는… 이걸 보았구나."),
    L("narr", "그날 밤 그가 안고 나온 아이는, 그가 벤 사람들의 딸이었다."),
  ],
  "s3-arc-intro": [
    L("arc", "오랜만이군, 무명검. 아니… 이제는 백도진이라 불러야 하나."),
    L("doj", "허명. 아직 살아 있었나."),
    L("arc", "기록관은 죽지 않네. 기록이 남아 있는 한."),
    L("arc", "자네가 그날 안고 나간 아이 말일세. 그 아이가 우리 서고를 뒤지더군. 제 부모의 서류를 찾아서."),
    L("doj", "서윤이는 어디 있나."),
    L("arc", "그건 열람 권한이 필요한 정보일세. …자네에겐 없지."),
  ],
  "s3-arc-down": [
    L("arc", "…훌륭하군. 기록에 남길 만한 검이야."),
    L("doj", "서윤이는."),
    L("arc", "아래층… 침묵의 병동. 영점 프로토콜의 시험장일세."),
    L("arc", "그 아이는 지워지기를 거부했네. 그래서 아직… 지워지지 않았지."),
    L("arc", "가 보게. 다만 기억하게. 자네가 구하려는 아이는, 자네를 용서한 적이 없네."),
    L("narr", "기록관의 포드가 꺼지자, 수천 개의 캡슐이 한꺼번에 어두워졌다."),
    L("doj", "용서받으려고 온 게 아니다."),
  ],
  "s2-null-down": [
    L("sys", "NULL-00… 신호 소실. 관성 제어 장치 정지."),
    L("narr", "멈춰 선 장비 속에서, 보안 장치 하나가 저절로 재생되기 시작했다."),
    L("seo", "아버지, 여기까지 오셨군요."),
    L("seo", "제발… 제가 왜 잡혀 왔는지만 보고 돌아가지 마세요."),
    L("seo", "이곳에는 아버지가 모르는 일이 있어요."),
    L("seo", "그리고… 저를 구하기 전에 꼭 알아야 할 진실도 있어요."),
    L("doj", "…서윤아."),
    L("narr", "서버 구역으로 이어지는 문이, 천천히 열렸다."),
  ],
};

// ---------------------------------------------------------------- barks

/** Short lines over play; never stop the game. Each plays once per session. */
export const BARKS: Record<string, Line[]> = {
  // STAGE 2 · the market (internal id 12)
  "s12-start": [L("doj", "하층은… 몇 년 만인가."), L("doj", "만식이 녀석, 아직 여기서 망치질을 하고 있겠지.", 0.5)],
  "s12-noodle": [L("vendor", "국수 한 그릇 하고 가요, 할아버지. 칩 없으면 고철도 받아.")],
  "s12-yeonmu": [L("queue", "팔이 시원찮으면 연무 선생한테 가 봐. 하나쯤은 새로 달아 준대.")],
  "s12-parts": [L("vendor", "백야 장비 부품이면 값 잘 쳐줘. 어디서 났는지는 안 물어.")],
  "s12-ration": [L("queue", "3구역은 열 시부터래. 오늘은 들어오려나."), L("queue", "권하린이 정한 거면 들어오겠지. 그 여자는 숫자는 안 틀려.", 0.3)],
  "s12-brownout": [L("vendor", "권하린이 또 잘랐네.")],
  "s12-chalk": [L("chalk", "…이 이름, 내가 쓴 건데. 누구였는지 생각이 안 나.")],
  "s12-crack": [L("doj", "벽 틈으로 바람이 새는군.")],
  "s12-eden": [L("queue", "에덴은 대기 번호가 석 달이래요."), L("queue", "거기 들어가면 안 아프대. 먼저 간 사람도 만난대.", 0.3)],
  "s12-laplace": [L("scan", "통행자 위험 지수 측정 중."), L("scan", "측정 불가. 미등록 인원.", 0.4), L("doj", "…숫자로 사람을 거르는군.", 0.4)],
  "s12-raid": [
    L("search", "백야 수색대입니다. 이 구역을 봉쇄합니다."),
    L("search", "미등록 노인을 숨기는 자는 같은 처분을 받습니다.", 0.2),
  ],
  "s12-hide": [L("hider", "이쪽! 셔터 안으로 들어와요, 어서!")],
  "s12-ambush": [L("youth", "저, 저기요! 그 노인… 저쪽으로 갔어요!"), L("youth", "…미안해요. 우리 집에 애가 둘이에요.", 0.4)],
  "s12-ambush-clear": [L("hider", "저 애 너무 미워하지 마요. 다들 식구가 있으니까."), L("doj", "알고 있소.", 0.4)],
  "s12-muyeong": [L("doj", "…외팔 문양.")],
  "s12-yard": [L("doj", "저게 승강기인가.")],
  "s12-bul-shield": [L("doj", "방패에는 칼이 안 먹는다. 뒤쪽… 열이 빠지는 곳을 노린다.")],
  "s12-bul-vent": [L("bul", "냉각 계통 손상. 방호판 분리."), L("doj", "이제 칼이 닿는다.", 0.3)],
  "s12-bul-low": [L("bul", "출력 한계 초과. 출력 한계 초과.")],
  // STAGE 1 · the outskirts (internal id 11)
  "s11-start": [L("doj", "…서윤아."), L("doj", "놈들이 오기 전에, 네 물건부터 챙기마.", 0.5)],
  "s11-door": [L("squad", "현관 봉쇄 완료. 잔여 물건 반출 시작."), L("doj", "문을 막았군. 베고 나간다.", 0.4)],
  "s11-yard": [L("doj", "그건 내 딸의 상자다. 내려놔라."), L("squad", "거주자 신경 접속 장치 미등록. 기억 정리 불가. 신병 확보로 전환.", 0.3)],
  "s11-rifle": [L("squad", "노인이 칼을 들었다. 사격 허가.")],
  "s11-firstkill": [L("doj", "…총알 정도는 아직 보인다.")],
  "s11-shed": [L("squad", "작업실 소각 개시. 드론, 불을 넓혀라."), L("doj", "그 아이 작업실을…!", 0.3)],
  "s11-ditch": [L("doj", "숨이 차는군. 이 몸도 예전 같지 않아.")],
  "s11-alley": [L("doj", "하층으로 내려가는 길은 이 골목 끝이었지.")],
  "s11-neighbor": [
    L("nbr", "어머, 도진 씨. 이 밤에 어딜 가요?"),
    L("nbr", "서윤이? 누구였더라… 좋은 애였던 것 같기도 하고.", 0.3),
    L("doj", "…밤이 늦었습니다. 창문 닫으세요.", 0.5),
  ],
  "s11-ambush": [L("squad", "표적이 트럭 쪽으로 이동. 전원 집결, 놈을 고립시켜.")],
  "s11-ambush-clear": [L("doj", "하아… 하아…", 0.2), L("doj", "고철값은 쳐 주겠지. 만식이라면.", 0.6)],
  "s11-cha-baton": [L("cha", "물러서시오!")],
  "s11-cha-flame": [L("cha", "소각기 압력 최대!")],
  "s11-cha-low": [L("cha", "왜 이렇게까지 하는 거요… 아무도 기억 못 하는 사람 때문에!")],
  // stage 1
  "s1-start": [L("doj", "옥상이군. 지상은 놈들의 눈이니, 여기로 간다."), L("doj", "보관탑까지… 버텨라, 서윤아.", 0.4)],
  "s1-barrel": [L("doj", "경비대 봉쇄물인가. 베고 지나간다.")],
  "s1-rifle": [L("radio", "표적 확인. 백도진이다. 사격 허가.")],
  "s1-firstkill": [L("doj", "녹슬지는 않았군.")],
  "s1-ads": [
    L("ad", "잊고 싶은 기억이 있으신가요? 백야 메모리 케어가 깨끗하게 정리해 드립니다."),
    L("ad", "백야 그룹. 당신의 내일을 기록합니다.", 0.2),
    L("doj", "…사람을 지우는 것도 장사가 되는군.", 0.4),
  ],
  "s1-drones": [L("radio", "표적이 옥상 경로로 이동 중. 자동 감시 드론 투입.")],
  "s1-heavy": [L("radio", "중화기 배치 완료. 놈을 탑에 닿게 하지 마라.")],
  "s1-ambush": [L("radio", "본부 지시다. 체포 명령 철회. 현장에서 처리한다.")],
  "s1-ambush-clear": [L("doj", "'처리'라… 예전엔 내가 쓰던 말이지.")],
  "s1-teaser": [L("oni", "오랜만입니다, 스승님. 헬리포트에서 기다리겠습니다."), L("doj", "…저 목소리.", 0.6)],
  "s1-oni-p2": [L("oni", "당신의 검은 여기서 끝납니다!"), L("doj", "검을 버린 건 네놈이다.", 0.3)],
  "s1-oni-chain": [L("oni", "천참(千斬)… 마지막 다섯 수를 받아 보십시오!"), L("doj", "…아직도 그 버릇을 고치지 못했구나.", 0.2)],

  // stage 2
  "s2-start": [
    L("pa", "외부 침입 확인. 보관탑 전 구역을 봉쇄합니다."),
    L("pa", "직원 여러분은 신경 접속 상태를 유지하고 자리를 지켜 주십시오.", 0.2),
    L("doj", "서윤이가 일하던 곳이… 여기였나.", 0.4),
  ],
  "s2-kamikaze": [L("pa", "해체 드론, 적대 추적 모드로 전환."), L("doj", "폭발물이다. 받아치지 말고 빠져나간다.", 0.2)],
  "s2-hall": [L("pa", "기억 보관 서버 냉각률 정상. 금일 정리 대상자 1,204명."), L("doj", "천이백 명…", 0.5)],
  "s2-servers": [L("ad", "백야 메모리 케어. 아픈 기억은 이제 내려놓으세요."), L("doj", "내려놓은 게 아니라, 빼앗긴 거다.", 0.4)],
  "s2-ambush": [L("pa", "경고. 침입자가 서버 구역에 접근 중. 집행 부대 투입.")],
  "s2-shaft": [L("pa", "최종 방어 단계. 실험체 NULL-00 봉인을 해제합니다.")],
  "s2-null-guard": [L("sys", "관성 제어 장치 정상. 외부 충격을 분산합니다.")],
  "s2-null-p2": [L("sys", "균형 제어 시스템 과부하. 출력 제한을 해제합니다.")],
  "s2-null-flurry": [L("sys", "최종 살상 명령 승인.")],

  // stage 3
  "s3-start": [L("doj", "지워진 사람들이… 전부 여기 있군."), L("sys", "열람 권한 없음. 기록 보존국은 외부인의 출입을 허락하지 않습니다.", 0.4)],
  "s3-gates": [L("sys", "보안 등급 상향. 소거 레이저 가동.")],
  "s3-turret": [L("doj", "칼이 닿지 않는 곳에 총이라… 받아서 돌려주면 그만이다.")],
  "s3-stacks": [L("doj", "선반마다 사람이다. 이름 하나, 얼굴 하나.")],
  "s3-ambush": [L("sys", "기록 보존국 경비대 투입. 열람자를 처리하십시오.")],
  "s3-ambush-clear": [L("doj", "서윤이가 본 것을… 나도 봐야 한다.")],
  "s3-vault": [L("arc", "들어오게, 무명검. 자네 서류는 아직 내 책상 위에 있네."), L("doj", "…허명.", 0.5)],
  "s3-arc-p2": [L("arc", "명령서에 서명한 건 나지만, 칼을 든 건 자네였네!"), L("doj", "알고 있다. 그래서 여기 왔다.", 0.3)],
  "s3-arc-erase": [L("arc", "전 기록 소거. 자네도, 그 아이도, 처음부터 없었던 걸로 하지.")],
};

/** Record fragments (stage 3): what each one says when read. */
export const RECORDS: Record<string, Line[]> = {
  "r-citizen1": [L("rec", "#00412 · 한지수(34) · 사유: 노동조합 결성 · 처리: 영점 완료"), L("doj", "…이름은 남아 있군. 지운 놈들이 기록은 남겨 뒀어.", 0.3)],
  "r-citizen2": [L("rec", "#01877 · 오민재(9) · 사유: 보호자 동반 삭제 · 처리: 영점 완료"), L("doj", "아이까지…", 0.3)],
  "r-citizen3": [L("rec", "#03350 · 류은채(41) · 사유: 내부 고발 · 집행: 무명검 부대 · 유족: 아들 류건(12), 부대 훈련생으로 편입"), L("doj", "…류건. 너는 알고 있었느냐.", 0.4)],
  "r-citizen4": [L("rec", "#05121 · 실험 대상 00 · 본래 이름: 기록 없음 · 사유: 영점 프로토콜 전투 적합성 시험"), L("doj", "NULL-00… 그놈도 누군가였겠지.", 0.4)],
};

/** Bark triggers by the hero's position (tile x), per stage. */
export const PLACE_BARKS: Record<number, { x: number; id: string }[]> = {
  12: [
    { x: 39, id: "s12-yeonmu" },
    { x: 87, id: "s12-crack" },
    { x: 149, id: "s12-laplace" },
    { x: 161, id: "s12-raid" },
    { x: 164, id: "s12-hide" },
    { x: 204, id: "s12-muyeong" },
    { x: 216, id: "s12-yard" },
  ],
  11: [
    { x: 29, id: "s11-door" },
    { x: 43, id: "s11-yard" },
    { x: 71, id: "s11-shed" },
    { x: 100, id: "s11-ditch" },
    { x: 113, id: "s11-alley" },
    { x: 133, id: "s11-neighbor" },
  ],
  1: [
    { x: 10, id: "s1-barrel" },
    { x: 55, id: "s1-ads" },
    { x: 79, id: "s1-drones" },
    { x: 101, id: "s1-heavy" },
  ],
  3: [
    { x: 80, id: "s3-gates" },
    { x: 115, id: "s3-stacks" },
    { x: 216, id: "s3-vault" },
  ],
  2: [
    { x: 70, id: "s2-hall" },
    { x: 133, id: "s2-servers" },
    { x: 207, id: "s2-shaft" },
  ],
};

/** The line under the clear card. */
export const CLEAR_LINES: Record<number, string> = {
  12: "화물 승강기가 네온 빛과 비 속으로 올라갔다. 다음 목적지: 보관탑으로 이어지는 네온 옥상.",
  11: "도진은 타다 남은 사진 한 장을 품에 넣고, 하층으로 내려가는 계단을 밟았다. 다음 목적지: 하층 시장, 강만식의 철야 정비소.",
  1: "도진은 빗물에 떨어진 가면을 잠시 내려다본 뒤, 보관탑으로 이어지는 통로에 들어섰다.",
  2: "그 너머, 기업이 지운 사람들의 기록이 잠든 곳으로. 그곳에는 그가 수십 년 동안 숨겨 온 과거가 기다리고 있다.",
  3: "침묵의 병동으로 내려가는 승강기가 열렸다. — 다음 이야기로 이어집니다",
};
