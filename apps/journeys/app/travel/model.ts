export type Locale = "en" | "zh-HK";
export type I18n = { en: string; "zh-HK": string };
export const w = (en: string, zh: string): I18n => ({ en, "zh-HK": zh });
export type Origin = {
  slug: string;
  version: number;
  creator: string;
  stopId: string;
};
export type Stop = {
  id: string;
  name: I18n;
  note: I18n;
  lat: number | null;
  lng: number | null;
  status: "planned" | "visited" | "suggested";
  public: boolean;
  personalNote: string;
  origin?: Origin;
  image?: string;
};
export type Day = { id: string; name: I18n; stops: Stop[] };
export type Adventure = {
  id: string;
  slug: string;
  title: I18n;
  city: I18n;
  destination: string;
  creator: string;
  image: string;
  style: string;
  party: string[];
  days: Day[];
  version: number;
  updated: string;
  active: boolean;
  cloneEligible: boolean;
};
export type Media = {
  id: string;
  name: string;
  url: string;
  status: "queued" | "uploading" | "processing" | "ready" | "failed";
  public: boolean;
  stopId?: string;
  error?: string;
};
export type Trip = {
  id: string;
  owner: string;
  purpose: "personal" | "journal";
  title: string;
  destination: string;
  date: string;
  timezone: string;
  days: Day[];
  note: string;
  media: Media[];
  revision: number;
  savedAt: string;
  publicationSlug?: string;
  publishedRevision?: number;
};
export type Role = "owner" | "editor" | "viewer" | "merchant" | "ops";
export type Session = { id: string; name: string; role: Role };
export type Proposal = {
  id: string;
  tripId: string;
  revision: number;
  expires: number;
  kind: "organise" | "relax" | "three";
  status: "needs_review" | "applied" | "cancelled";
  changes: { id: string; name: string; selected: boolean }[];
};
export type Store = {
  schema: 2;
  session: Session | null;
  trips: Trip[];
  publications: Adventure[];
  bookmarks: Record<string, string[]>;
  proposals: Proposal[];
  ops: Record<string, { hash: string; result: unknown }>;
  missions: {
    id: string;
    owner: string;
    state: "submitted" | "review" | "approved" | "rejected";
    note: string;
    feedback?: string;
    revision?: number;
  }[];
  receipts: {
    id: string;
    owner: string;
    name: string;
    state: "submitted" | "review" | "rejected";
  }[];
  payouts: {
    id: string;
    owner: string;
    currency: "HKD" | "JPY";
    amount: number;
    state: "reserved" | "failed" | "cancelled" | "uncertain";
    allocations: string[];
  }[];
};
export const count = (a: { days: Day[] }) =>
  a.days.reduce((n, d) => n + d.stops.length, 0);
export const id = (prefix: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `demo-${prefix}-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const stop = (
  sid: string,
  en: string,
  zh: string,
  lat: number,
  lng: number,
  note: string,
  cn: string,
): Stop => ({
  id: sid,
  name: w(en, zh),
  lat,
  lng,
  note: w(note, cn),
  status: "planned",
  public: true,
  personalNote: "",
});
const day = (did: string, en: string, zh: string, stops: Stop[]): Day => ({
  id: did,
  name: w(en, zh),
  stops,
});
export const creators = [
  {
    id: "mika",
    name: "Mika",
    initials: "MK",
    bio: w(
      "Neighbourhood walks and small discoveries.",
      "街區散步，以及旅途上的小發現。",
    ),
  },
  {
    id: "chloe",
    name: "Chloe",
    initials: "CL",
    bio: w(
      "Hong Kong on foot, from local streets to the harbour.",
      "用雙腳認識香港，從街坊小店走到海旁。",
    ),
  },
  {
    id: "ines",
    name: "Inês",
    initials: "IN",
    bio: w("A slower look at Lisbon.", "慢慢探索里斯本。"),
  },
];
const kyoto = [
  day("k1", "Eastern Kyoto", "京都東山", [
    stop(
      "k-1",
      "Ginkaku-ji",
      "銀閣寺",
      35.027,
      135.7982,
      "Begin in the north and work your way south. Check opening hours before visiting.",
      "從北面開始，再往南走。出發前請確認開放時間。",
    ),
    stop(
      "k-2",
      "Philosopher’s Path",
      "哲學之道",
      35.0214,
      135.7936,
      "Leave time for a walk along the canal. Adjust for the weather.",
      "留點時間沿河散步，按天氣調整安排。",
    ),
    stop(
      "k-3",
      "Nanzen-ji",
      "南禪寺",
      35.0114,
      135.7945,
      "A quiet finish. Some areas require a separate admission ticket.",
      "安靜地結束一天。部分區域需另購門票。",
    ),
  ]),
  day("k2", "Old streets & river light", "老街與河畔", [
    stop(
      "k-4",
      "Kiyomizu-dera",
      "清水寺",
      34.9949,
      135.785,
      "The approach has slopes and steps. Check access for your needs.",
      "沿路有斜坡及樓梯，請按需要確認通道。",
    ),
    stop(
      "k-5",
      "Ninenzaka",
      "二年坂",
      34.9981,
      135.7807,
      "Browse slowly and respect the residential lanes.",
      "慢慢逛，也請尊重附近居民。",
    ),
    stop(
      "k-6",
      "Kamogawa at Sanjo",
      "三條鴨川河畔",
      35.0087,
      135.771,
      "Keep the final stop flexible around weather and energy.",
      "最後一站可按天氣及體力彈性調整。",
    ),
  ]),
];
const hk = [
  day("h1", "Kowloon, street to harbour", "九龍街角到海旁", [
    stop(
      "h-1",
      "Sham Shui Po",
      "深水埗",
      22.3303,
      114.1622,
      "Explore around the station and choose a local food stop.",
      "從港鐵站一帶出發，挑選喜歡的街坊小店。",
    ),
    stop(
      "h-2",
      "Temple Street",
      "廟街",
      22.307,
      114.1702,
      "Check stall opening times and your last transport.",
      "留意攤檔營業及尾班車時間。",
    ),
    stop(
      "h-3",
      "Avenue of Stars",
      "星光大道",
      22.2931,
      114.1748,
      "Finish by the harbour. Have a wet-weather alternative.",
      "在海旁結束一天，雨天可另作安排。",
    ),
  ]),
];
const lisbon = [
  day("l1", "Alfama & the old city", "阿爾法瑪與舊城", [
    stop(
      "l-1",
      "Miradouro de Santa Luzia",
      "聖露西亞觀景台",
      38.7118,
      -9.1302,
      "Steep streets surround the viewpoint.",
      "觀景台附近街道較陡。",
    ),
    stop(
      "l-2",
      "Lisbon Cathedral",
      "里斯本主教座堂",
      38.7098,
      -9.1326,
      "Check visitor access before arriving.",
      "到訪前確認開放安排。",
    ),
  ]),
  day("l2", "Along the river", "沿河慢行", [
    stop(
      "l-3",
      "Praça do Comércio",
      "商業廣場",
      38.7077,
      -9.1366,
      "An open square beside the Tagus.",
      "在塔霍河旁的開揚廣場。",
    ),
    stop(
      "l-4",
      "Belém Tower",
      "貝倫塔",
      38.6916,
      -9.216,
      "Plan transport for this western stop separately.",
      "此站位於西面，請另行安排交通。",
    ),
  ]),
  day("l3", "Neighbourhood discoveries", "街區新發現", [
    stop(
      "l-5",
      "Jardim da Estrela",
      "星園",
      38.7143,
      -9.1601,
      "Leave room for a garden break.",
      "留點時間在公園歇一歇。",
    ),
    stop(
      "l-6",
      "LX Factory",
      "LX Factory",
      38.7033,
      -9.1786,
      "Check individual shop opening hours.",
      "先確認各商店營業時間。",
    ),
  ]),
];
const tokyo = [
  day("t1", "Old Tokyo", "東京老街", [
    stop(
      "t-1",
      "Sensō-ji",
      "淺草寺",
      35.7148,
      139.7967,
      "Explore the temple grounds and nearby streets.",
      "探索寺院與附近街道。",
    ),
    stop(
      "t-2",
      "Sumida Park",
      "隅田公園",
      35.7155,
      139.8015,
      "A riverside pause, depending on the weather.",
      "在河畔休息一下，按天氣調整。",
    ),
  ]),
  day("t2", "West-side neighbourhoods", "西面街區", [
    stop(
      "t-3",
      "Meiji Jingū",
      "明治神宮",
      35.6764,
      139.6993,
      "Allow time for the wooded approach.",
      "為林蔭參道留一點時間。",
    ),
    stop(
      "t-4",
      "Yoyogi Park",
      "代代木公園",
      35.6717,
      139.6949,
      "Keep this outdoor stop flexible.",
      "此戶外站可彈性調整。",
    ),
  ]),
];
const seoul = [
  day("s1", "Old Seoul", "首爾舊城", [
    stop(
      "s-1",
      "Gyeongbokgung",
      "景福宮",
      37.5796,
      126.977,
      "Check opening days before going.",
      "出發前確認開放日期。",
    ),
    stop(
      "s-2",
      "Bukchon Hanok Village",
      "北村韓屋村",
      37.5826,
      126.983,
      "Respect residential visiting hours.",
      "尊重住宅區的參觀時間。",
    ),
  ]),
  day("s2", "City rhythm", "城市節奏", [
    stop(
      "s-3",
      "Cheonggyecheon",
      "清溪川",
      37.5692,
      126.9788,
      "A flexible walk through the city.",
      "在城市中心彈性散步。",
    ),
  ]),
];
const sg = [
  day("sg1", "Neighbourhoods", "街區漫步", [
    stop(
      "sg-1",
      "Tiong Bahru",
      "中峇魯",
      1.2843,
      103.8326,
      "Choose a café on arrival.",
      "即場選一間喜歡的咖啡店。",
    ),
    stop(
      "sg-2",
      "National Gallery Singapore",
      "新加坡國家美術館",
      1.2902,
      103.8515,
      "Verify tickets and exhibitions.",
      "先確認門票及展覽。",
    ),
  ]),
  day("sg2", "Gardens & waterfront", "花園與海濱", [
    stop(
      "sg-3",
      "Gardens by the Bay",
      "濱海灣花園",
      1.2816,
      103.8636,
      "Outdoor areas and conservatories have different access.",
      "戶外區及溫室有不同入場安排。",
    ),
  ]),
];
function adventure(
  slug: string,
  title: I18n,
  city: I18n,
  destination: string,
  creator: string,
  style: string,
  days: Day[],
): Adventure {
  return {
    id: `demo-public-${slug}`,
    slug,
    title,
    city,
    destination,
    creator,
    image: `/photos/${destination === "hong-kong" ? "hongKong" : destination}.jpg`,
    style,
    days,
    party: style === "family" ? ["family", "couple"] : ["solo", "couple"],
    version: 1,
    updated: "2026-09-10",
    active: true,
    cloneEligible: true,
  };
}
export const fixtures: Adventure[] = [
  adventure(
    "kyoto-slow-days",
    w("A little slower, in Kyoto", "京都，慢一點剛剛好"),
    w("Kyoto", "京都"),
    "kyoto",
    "mika",
    "slow",
    kyoto,
  ),
  adventure(
    "hong-kong-after-last-train",
    w("Hong Kong, after the lights come on", "香港，入夜後的另一面"),
    w("Hong Kong", "香港"),
    "hong-kong",
    "chloe",
    "night",
    hk,
  ),
  adventure(
    "lisbon-beyond-the-postcard",
    w("Lisbon beyond the postcard", "走進明信片以外的里斯本"),
    w("Lisbon", "里斯本"),
    "lisbon",
    "ines",
    "culture",
    lisbon,
  ),
  adventure(
    "seoul-night-rhythm",
    w("Seoul, one neighbourhood at a time", "首爾，一次走一個街區"),
    w("Seoul", "首爾"),
    "seoul",
    "mika",
    "culture",
    seoul,
  ),
  adventure(
    "singapore-family-rhythm",
    w("Room to breathe in Singapore", "新加坡，留白的家庭時光"),
    w("Singapore", "新加坡"),
    "singapore",
    "mika",
    "family",
    sg,
  ),
  adventure(
    "tokyo-neighbourhood-days",
    w("Tokyo through its neighbourhoods", "東京，在街區中慢慢發現"),
    w("Tokyo", "東京"),
    "tokyo",
    "mika",
    "slow",
    tokyo,
  ),
  ...Array.from({ length: 7 }, (_, i) =>
    adventure(
      `kyoto-walk-${i + 1}`,
      w(
        [
          "Along the Philosopher’s Path",
          "An afternoon in Higashiyama",
          "Kyoto temple mornings",
          "At the edge of Kamogawa",
          "Old Kyoto on foot",
          "A quiet Kyoto weekend",
          "Time for Ninenzaka",
        ][i],
        [
          "沿著哲學之道",
          "東山的一個下午",
          "京都寺院清晨",
          "走到鴨川河畔",
          "用雙腳認識京都",
          "安靜的京都週末",
          "留點時間給二年坂",
        ][i],
      ),
      w("Kyoto", "京都"),
      "kyoto",
      "mika",
      "slow",
      [structuredClone(kyoto[i % 2])],
    ),
  ),
];
export const KEY = "kinnso-journeys:demo:v2";
export class AppError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const fail = (c: string): never => {
  throw new AppError(c);
};
export const blank = (): Store => ({
  schema: 2,
  session: null,
  trips: [],
  publications: [],
  bookmarks: {},
  proposals: [],
  ops: {},
  missions: [],
  receipts: [],
  payouts: [],
});
const textOK = (x: unknown) =>
  !!x &&
  typeof x === "object" &&
  typeof (x as I18n).en === "string" &&
  typeof (x as I18n)["zh-HK"] === "string" &&
  Object.keys(x).every((k) => ["en", "zh-HK"].includes(k));
export function validateTrip(v: unknown): Trip {
  const t = v as Trip;
  if (
    !t ||
    typeof t.id !== "string" ||
    !t.id.startsWith("demo-") ||
    typeof t.owner !== "string" ||
    !["personal", "journal"].includes(t.purpose) ||
    typeof t.destination !== "string" ||
    typeof t.date !== "string" ||
    typeof t.timezone !== "string" ||
    !Number.isInteger(t.revision) ||
    t.revision < 1 ||
    typeof t.title !== "string" ||
    t.title.length > 120 ||
    typeof t.note !== "string" ||
    t.note.length > 10000 ||
    !Array.isArray(t.days) ||
    t.days.length < 1 ||
    t.days.length > 30 ||
    !Array.isArray(t.media)
  )
    fail("CONTRACT_ERROR");
  try {
    new Intl.DateTimeFormat("en", { timeZone: t.timezone });
  } catch {
    fail("CONTRACT_ERROR");
  }
  if (
    t.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      !Number.isFinite(Date.parse(t.date)) ||
      new Date(t.date).toISOString().slice(0, 10) !== t.date)
  )
    fail("CONTRACT_ERROR");
  for (const d of t.days) {
    if (
      !d ||
      typeof d !== "object" ||
      !d.id ||
      !textOK(d.name) ||
      !Array.isArray(d.stops)
    )
      fail("CONTRACT_ERROR");
    for (const s of d.stops) {
      if (
        !s ||
        typeof s !== "object" ||
        !s.id ||
        !textOK(s.name) ||
        !textOK(s.note) ||
        !["planned", "visited", "suggested"].includes(s.status) ||
        typeof s.public !== "boolean"
      )
        fail("CONTRACT_ERROR");
      if (
        (s.lat === null) !== (s.lng === null) ||
        (s.lat !== null &&
          (!Number.isFinite(s.lat) ||
            Math.abs(s.lat) > 90 ||
            !Number.isFinite(s.lng) ||
            Math.abs(s.lng!) > 180))
      )
        fail("CONTRACT_ERROR");
    }
  }
  for (const m of t.media)
    if (
      !m ||
      typeof m !== "object" ||
      !m.id ||
      !["queued", "uploading", "processing", "ready", "failed"].includes(
        m.status,
      ) ||
      typeof m.public !== "boolean" ||
      typeof m.url !== "string" ||
      typeof m.name !== "string"
    )
      fail("CONTRACT_ERROR");
  return t;
}
export function validateStore(v: unknown): Store {
  const s = v as Store;
  if (
    !s ||
    s.schema !== 2 ||
    !Array.isArray(s.trips) ||
    !Array.isArray(s.publications) ||
    !Array.isArray(s.proposals) ||
    !s.bookmarks ||
    !s.ops ||
    !Array.isArray(s.missions) ||
    !Array.isArray(s.receipts) ||
    !Array.isArray(s.payouts)
  )
    fail("CONTRACT_ERROR");
  if (
    s.session &&
    (!s.session.id ||
      !["owner", "viewer", "editor", "merchant", "ops"].includes(
        s.session.role,
      ))
  )
    fail("CONTRACT_ERROR");
  s.trips.forEach(validateTrip);
  for (const p of s.payouts)
    if (
      !["reserved", "failed", "cancelled", "uncertain"].includes(p.state) ||
      !["HKD", "JPY"].includes(p.currency) ||
      !Number.isFinite(p.amount) ||
      !Array.isArray(p.allocations)
    )
      fail("CONTRACT_ERROR");
  return s;
}
export function read(): Store {
  if (typeof localStorage === "undefined") return blank();
  try {
    const v = localStorage.getItem(KEY);
    return v ? validateStore(JSON.parse(v)) : blank();
  } catch (e) {
    if (e instanceof AppError) throw e;
    return fail("STORAGE_ERROR");
  }
}
export function write(s: Store) {
  validateStore(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("kinnso-change"));
  } catch {
    fail("STORAGE_ERROR");
  }
}
export const permission = (session: Session | null, trip?: Trip) => ({
  read:
    !!session &&
    !!trip &&
    session.id === trip.owner &&
    ["owner", "viewer", "editor"].includes(session.role),
  edit:
    !!session &&
    !!trip &&
    session.id === trip.owner &&
    ["owner", "editor"].includes(session.role),
  publish:
    !!session &&
    !!trip &&
    session.id === trip.owner &&
    session.role === "owner",
});
export const tripsFor = (s: Store) =>
  s.trips.filter((t) => permission(s.session, t).read);
export function publications(s: Store) {
  const m = new Map(fixtures.map((a) => [a.slug, a]));
  s.publications.forEach((a) => m.set(a.slug, a));
  return [...m.values()].filter((a) => a.active);
}
export const findPublic = (s: Store, slug: string) =>
  publications(s).find((a) => a.slug === slug);
export function effectiveStop(s: Store, stop: Stop): Stop {
  if (!stop.origin || findPublic(s, stop.origin.slug)) return stop;
  return {
    ...stop,
    name: w("Source withdrawn", "來源已撤回"),
    note: w("Your own notes remain available.", "你的私人筆記仍保留。"),
    image: undefined,
    lat: null,
    lng: null,
  };
}
export function session(role: Role | "other" | null) {
  const s = read();
  s.session = role
    ? {
        id:
          role === "other"
            ? "demo-other"
            : ["merchant", "ops"].includes(role)
              ? `demo-${role}`
              : "demo-owner",
        role: role === "other" ? "owner" : role,
        name:
          role === "other"
            ? "Alex"
            : role === "merchant"
              ? "Harbour Studio"
              : role === "ops"
                ? "Kinnso Ops"
                : "Jamie",
      }
    : null;
  write(s);
  return s;
}
export type Fault =
  | "none"
  | "network"
  | "conflict"
  | "quota"
  | "expired"
  | "contract"
  | "upload";
let nextFault: Fault = "none";
export function fault(f: Fault) {
  nextFault = f;
}
export function check() {
  const f = nextFault;
  nextFault = "none";
  const codes: Record<Fault, string> = {
    none: "",
    network: "NETWORK_ERROR",
    conflict: "REVISION_CONFLICT",
    quota: "QUOTA_EXCEEDED",
    expired: "APPROVAL_EXPIRED",
    contract: "CONTRACT_ERROR",
    upload: "UPLOAD_FAILED",
  };
  if (codes[f]) fail(codes[f]);
}
function authorizeCommand(s: Store, key: string, payload: unknown) {
  const action = key.split(":")[0],
    p = payload as Record<string, unknown>;
  if (
    ["create", "clone"].includes(action) &&
    !["owner", "editor"].includes(s.session!.role)
  )
    fail("FORBIDDEN");
  if (
    ["payout", "mission", "receipt"].includes(action) &&
    s.session!.role !== "owner"
  )
    fail("FORBIDDEN");
  if (action === "merchantReview" && s.session!.role !== "merchant")
    fail("FORBIDDEN");
  if (
    ["save", "addStop", "propose", "apply", "publish", "withdraw"].includes(
      action,
    )
  ) {
    const tripId =
      action === "save"
        ? (p.input as Trip)?.id
        : action === "apply"
          ? s.proposals.find((x) => x.id === p.proposalId)?.tripId
          : action === "withdraw"
            ? s.trips.find((x) => x.publicationSlug === p.slug)?.id
            : action === "publish"
              ? p.id
              : p.tripId;
    const current = s.trips.find((t) => t.id === tripId),
      access = permission(s.session, current);
    if (
      ["publish", "withdraw"].includes(action) ? !access.publish : !access.edit
    )
      fail("FORBIDDEN");
  }
}
export function exportAccount(s: Store) {
  if (!s.session) fail("SIGN_IN_REQUIRED");
  const owner = s.session!.id,
    tripIds = new Set(tripsFor(s).map((t) => t.id));
  return {
    schema: 2,
    scope: "current demo account backup",
    exportedAt: new Date().toISOString(),
    trips: tripsFor(s),
    publications: s.publications.filter((a) =>
      s.trips.some((t) => tripIds.has(t.id) && t.publicationSlug === a.slug),
    ),
    bookmarks: s.bookmarks[owner] || [],
    proposals: s.proposals.filter((p) => tripIds.has(p.tripId)),
    missions: s.missions.filter((x) => x.owner === owner),
    receipts: s.receipts.filter((x) => x.owner === owner),
    payouts: s.payouts.filter((x) => x.owner === owner),
  };
}
export function leaveAccount() {
  const s = read();
  if (!s.session) return;
  const owner = s.session.id,
    slugs = new Set(
      s.trips.filter((t) => t.owner === owner).map((t) => t.publicationSlug),
    );
  s.trips = s.trips.filter((t) => t.owner !== owner);
  s.publications = s.publications.filter((p) => !slugs.has(p.slug));
  s.proposals = s.proposals.filter((p) =>
    s.trips.some((t) => t.id === p.tripId),
  );
  delete s.bookmarks[owner];
  for (const k of Object.keys(s.ops))
    if (k.startsWith(owner + ":")) delete s.ops[k];
  s.missions = s.missions.filter((x) => x.owner !== owner);
  s.receipts = s.receipts.filter((x) => x.owner !== owner);
  s.payouts = s.payouts.filter((x) => x.owner !== owner);
  s.session = null;
  write(s);
}
export function command<T>(
  key: string,
  payload: unknown,
  fn: (s: Store) => T,
): T {
  check();
  const s = read();
  if (!s.session) fail("SIGN_IN_REQUIRED");
  authorizeCommand(s, key, payload);
  const k = `${s.session!.id}:${key}`,
    hash = JSON.stringify(payload),
    old = s.ops[k];
  if (old) {
    if (old.hash !== hash) fail("IDEMPOTENCY_CONFLICT");
    return structuredClone(old.result as T);
  }
  const result = fn(s);
  s.ops[k] = { hash, result };
  write(s);
  return structuredClone(result);
}
export function create(
  title: string,
  purpose: Trip["purpose"],
  date: string,
  key: string,
) {
  return command("create:" + key, { title, purpose, date }, (s) => {
    if (!["owner", "editor"].includes(s.session!.role)) fail("FORBIDDEN");
    const t: Trip = {
      id: id("trip"),
      owner: s.session!.id,
      purpose,
      title: title.trim() || "Untitled trip",
      destination: "",
      date,
      timezone: "Asia/Hong_Kong",
      days: [{ id: id("day"), name: w("Day 1", "第 1 日"), stops: [] }],
      note: "",
      media: [],
      revision: 1,
      savedAt: new Date().toISOString(),
    };
    s.trips.push(validateTrip(t));
    return t;
  });
}
export function save(input: Trip, expected: number, key: string) {
  return command("save:" + key, { input, expected }, (s) => {
    const i = s.trips.findIndex((t) => t.id === input.id),
      current = s.trips[i];
    if (!permission(s.session, current).edit) fail("FORBIDDEN");
    if (current.revision !== expected) fail("REVISION_CONFLICT");
    const t = validateTrip({
      ...structuredClone(input),
      owner: current.owner,
      publicationSlug: current.publicationSlug,
      publishedRevision: current.publishedRevision,
      revision: current.revision + 1,
      savedAt: new Date().toISOString(),
    });
    s.trips[i] = t;
    return t;
  });
}
export function bookmark(slug: string, key: string) {
  return command("bookmark:" + key, { slug }, (s) => {
    if (!findPublic(s, slug)) fail("SOURCE_UNAVAILABLE");
    const b = s.bookmarks[s.session!.id] || [];
    return (s.bookmarks[s.session!.id] = b.includes(slug)
      ? b.filter((x) => x !== slug)
      : [...b, slug]);
  });
}
export function clone(slug: string, title: string, date: string, key: string) {
  return command("clone:" + key, { slug, title, date }, (s) => {
    const a = findPublic(s, slug);
    if (!a?.cloneEligible) fail("SOURCE_UNAVAILABLE");
    if (!["owner", "editor"].includes(s.session!.role)) fail("FORBIDDEN");
    const t: Trip = {
      id: id("trip"),
      owner: s.session!.id,
      purpose: "personal",
      title: title || a!.title.en,
      destination: a!.destination,
      date,
      timezone:
        a!.destination === "lisbon"
          ? "Europe/Lisbon"
          : ["kyoto", "tokyo"].includes(a!.destination)
            ? "Asia/Tokyo"
            : a!.destination === "seoul"
              ? "Asia/Seoul"
              : "Asia/Hong_Kong",
      days: a!.days.map((d) => ({
        ...structuredClone(d),
        id: id("day"),
        stops: d.stops.map((st) => ({
          ...structuredClone(st),
          id: id("stop"),
          status: "planned",
          personalNote: "",
          origin: {
            slug,
            version: a!.version,
            creator: a!.creator,
            stopId: st.id,
          },
        })),
      })),
      note: "",
      media: [],
      revision: 1,
      savedAt: new Date().toISOString(),
    };
    s.trips.push(validateTrip(t));
    return t;
  });
}
export function addStop(
  slug: string,
  stopId: string,
  tripId: string,
  dayId: string,
  revision: number,
  key: string,
) {
  return command(
    "addStop:" + key,
    { slug, stopId, tripId, dayId, revision },
    (s) => {
      const a = findPublic(s, slug),
        st = a?.days.flatMap((d) => d.stops).find((x) => x.id === stopId),
        t = s.trips.find((x) => x.id === tripId);
      if (!st || !a?.cloneEligible) fail("SOURCE_UNAVAILABLE");
      if (!permission(s.session, t).edit) fail("FORBIDDEN");
      if (t!.revision !== revision) fail("REVISION_CONFLICT");
      const d = t!.days.find((d) => d.id === dayId);
      if (!d) fail("CONTRACT_ERROR");
      d!.stops.push({
        ...structuredClone(st!),
        id: id("stop"),
        status: "planned",
        personalNote: "",
        origin: { slug, version: a!.version, creator: a!.creator, stopId },
      });
      t!.revision++;
      t!.savedAt = new Date().toISOString();
      return t!;
    },
  );
}
export function propose(t: Trip, kind: Proposal["kind"], key: string) {
  return command(
    "propose:" + key,
    { tripId: t.id, revision: t.revision, kind },
    (s) => {
      const current = s.trips.find((x) => x.id === t.id);
      if (!permission(s.session, current).edit) fail("FORBIDDEN");
      if (current!.revision !== t.revision) fail("REVISION_CONFLICT");
      const names =
        kind === "organise"
          ? t.note
              .split(/\n+/)
              .filter((x) => x.trim())
              .slice(0, 5)
          : [
              kind === "relax"
                ? "Move the last stop to Day 2"
                : "Add Day 3 and move the last stop",
            ];
      if (!names.length) names.push(...t.media.slice(0, 3).map((m) => m.name));
      if (!names.length) fail("NO_MATERIAL");
      const p: Proposal = {
        id: id("proposal"),
        tripId: t.id,
        revision: t.revision,
        expires: Date.now() + 600000,
        kind,
        status: "needs_review",
        changes: names.map((name, i) => ({
          id: String(i),
          name: name.slice(0, 120),
          selected: true,
        })),
      };
      s.proposals.push(p);
      return p;
    },
  );
}
export function apply(p: Proposal, key: string) {
  return command(
    "apply:" + key,
    { proposalId: p.id, changes: p.changes },
    (s) => {
      const original = s.proposals.find((x) => x.id === p.id),
        t = s.trips.find((x) => x.id === original?.tripId);
      if (!original || original.status !== "needs_review")
        fail("APPROVAL_INVALID");
      if (
        p.tripId !== original!.tripId ||
        p.revision !== original!.revision ||
        p.kind !== original!.kind ||
        !Array.isArray(p.changes) ||
        p.changes.some(
          (c) =>
            !original!.changes.some((o) => o.id === c.id) ||
            typeof c.name !== "string" ||
            c.name.length > 120 ||
            typeof c.selected !== "boolean",
        ) ||
        new Set(p.changes.map((c) => c.id)).size !== p.changes.length
      )
        fail("APPROVAL_INVALID");
      if (Date.now() > original!.expires) fail("APPROVAL_EXPIRED");
      if (!permission(s.session, t).edit) fail("FORBIDDEN");
      if (t!.revision !== original!.revision) fail("REVISION_CONFLICT");
      for (const c of p.changes.filter((c) => c.selected)) {
        if (p.kind === "organise")
          t!.days[0].stops.push({
            id: id("stop"),
            name: w(c.name, c.name),
            note: w("", ""),
            personalNote: c.name,
            lat: null,
            lng: null,
            public: false,
            status: "suggested",
          });
        else {
          const target = p.kind === "three" ? 2 : 1;
          while (t!.days.length <= target)
            t!.days.push({
              id: id("day"),
              name: w(
                `Day ${t!.days.length + 1}`,
                `第 ${t!.days.length + 1} 日`,
              ),
              stops: [],
            });
          const last = t!.days[0].stops.pop();
          if (last) t!.days[target].stops.unshift(last);
        }
      }
      original!.status = "applied";
      t!.revision++;
      t!.savedAt = new Date().toISOString();
      validateTrip(t);
      return t!;
    },
  );
}
export function cancelProposal(pid: string) {
  const s = read(),
    p = s.proposals.find((p) => p.id === pid);
  if (
    p &&
    permission(
      s.session,
      s.trips.find((t) => t.id === p.tripId),
    ).edit
  ) {
    p.status = "cancelled";
    write(s);
  }
}
export function preview(t: Trip): Adventure {
  validateTrip(t);
  const state = read();
  const days = t.days
    .map((d) => ({
      id: d.id,
      name: w(d.name.en, d.name["zh-HK"]),
      stops: d.stops
        .filter(
          (st) =>
            st.public === true &&
            (!st.origin || !!findPublic(state, st.origin.slug)),
        )
        .map((st) => ({
          id: st.id,
          name: w(st.name.en, st.name["zh-HK"]),
          note: w(st.note.en, st.note["zh-HK"]),
          lat: st.lat,
          lng: st.lng,
          status: st.status,
          public: true,
          personalNote: "",
          origin: st.origin
            ? {
                slug: st.origin.slug,
                version: st.origin.version,
                creator: st.origin.creator,
                stopId: st.origin.stopId,
              }
            : undefined,
          image: t.media.find(
            (m) =>
              m.public === true &&
              m.url.startsWith("data:image/") &&
              m.stopId === st.id &&
              m.status === "ready",
          )?.url,
        })),
    }))
    .filter((d) => d.stops.length);
  return {
    id: "demo-public-" + t.id,
    slug: t.publicationSlug || "journal-" + t.id,
    title: w(t.title, t.title),
    city: w(t.destination, t.destination),
    destination: t.destination,
    creator: "you",
    image:
      t.media.find(
        (m) =>
          m.public === true &&
          m.url.startsWith("data:image/") &&
          m.status === "ready",
      )?.url || "",
    days,
    version: 1,
    updated: new Date().toISOString().slice(0, 10),
    style: "slow",
    party: [],
    active: true,
    cloneEligible:
      days.length > 0 &&
      days.every((d) =>
        d.stops.every((st) => st.lat !== null && st.status !== "suggested"),
      ),
  };
}
export function publish(t: Trip, key: string) {
  return command("publish:" + key, { id: t.id, revision: t.revision }, (s) => {
    const current = s.trips.find((x) => x.id === t.id);
    if (!permission(s.session, current).publish) fail("FORBIDDEN");
    if (t.revision !== current!.revision) fail("REVISION_CONFLICT");
    const a = preview(current!);
    if (!a.title.en.trim() || !a.destination || !a.days.length)
      fail("PUBLICATION_INCOMPLETE");
    a.version =
      1 +
      Math.max(
        0,
        ...s.publications
          .filter((p) => p.slug === a.slug)
          .map((p) => p.version),
      );
    s.publications.push(a);
    current!.publicationSlug = a.slug;
    current!.publishedRevision = current!.revision;
    return a;
  });
}
export function withdraw(slug: string, key: string) {
  return command("withdraw:" + key, { slug }, (s) => {
    const t = s.trips.find((x) => x.publicationSlug === slug);
    if (!permission(s.session, t).publish) fail("FORBIDDEN");
    s.publications
      .filter((a) => a.slug === slug)
      .forEach((a) => (a.active = false));
    return { slug, active: false };
  });
}
export type EState =
  | "estimated"
  | "pending"
  | "held"
  | "eligible"
  | "reserved"
  | "paid"
  | "adjustment"
  | "reversed"
  | "reconciliation_hold";
export type Earning = {
  id: string;
  currency: "HKD" | "JPY";
  amount: number;
  state: EState;
  title: I18n;
  slug: string;
  stop: string;
  date: string;
  reference?: string;
  adjusts?: string;
};
export const earnings: Earning[] = [
  ["e1", "HKD", 240, "pending", "Neighbourhood photo mission", "街區攝影任務"],
  [
    "e2",
    "HKD",
    480,
    "eligible",
    "Hong Kong walking route campaign",
    "香港步行路線合作",
  ],
  ["e3", "HKD", 1200, "paid", "September creator mission", "九月創作者任務"],
  [
    "e4",
    "HKD",
    -180,
    "adjustment",
    "Partial refund after payment",
    "付款後部分退款",
  ],
  ["e5", "HKD", 320, "reserved", "Payout being processed", "處理中的款項"],
  [
    "e6",
    "HKD",
    90,
    "reconciliation_hold",
    "Payment result being checked",
    "付款結果核對中",
  ],
  ["e7", "JPY", 4200, "eligible", "Kyoto collaboration", "京都街區合作"],
  ["e8", "JPY", 8000, "paid", "Japan route campaign", "日本路線合作"],
  ["e9", "JPY", -1200, "adjustment", "Refund adjustment", "退款調整"],
  [
    "e10",
    "HKD",
    150,
    "estimated",
    "Unconfirmed campaign estimate",
    "未確認合作預估",
  ],
  ["e11", "HKD", 100, "held", "Evidence under review", "證明資料審閱中"],
  ["e12", "HKD", -60, "reversed", "Cancelled conversion", "已取消交易"],
].map(([eid, currency, amount, state, en, zh], i) => ({
  id: String(eid),
  currency: currency as "HKD" | "JPY",
  amount: Number(amount),
  state: state as EState,
  title: w(String(en), String(zh)),
  slug: i < 2 ? "hong-kong-after-last-train" : "kyoto-slow-days",
  stop: i < 2 ? "Temple Street" : "Nanzen-ji",
  date: `2026-09-${String(2 + (i % 8)).padStart(2, "0")}`,
  reference: state === "paid" ? `DEMO-PAY-${eid}` : undefined,
  adjusts: eid === "e4" ? "e3" : eid === "e9" ? "e8" : undefined,
}));
export function earningsView(
  currency: "HKD" | "JPY",
  from: string,
  to: string,
) {
  if (!["HKD", "JPY"].includes(currency)) fail("CONTRACT_ERROR");
  const state = read(),
    owner = state.session?.id,
    entries =
      owner === "demo-owner"
        ? earnings.filter(
            (e) => e.currency === currency && e.date >= from && e.date <= to,
          )
        : [],
    sum = (states: EState[]) =>
      entries
        .filter((e) => states.includes(e.state))
        .reduce((n, e) => n + e.amount, 0),
    allocations = new Set(
      state.payouts
        .filter(
          (p) =>
            p.owner === owner &&
            p.currency === currency &&
            !["failed", "cancelled"].includes(p.state),
        )
        .flatMap((p) => p.allocations),
    ),
    allocated = entries
      .filter((e) => allocations.has(e.id))
      .reduce((n, e) => n + e.amount, 0);
  return {
    entries: entries.map((e) =>
      allocations.has(e.id) && e.state === "eligible"
        ? { ...e, state: "reserved" as EState }
        : e,
    ),
    pending: sum(["pending"]),
    eligible: sum(["eligible", "adjustment", "reversed"]) - allocated,
    paid: sum(["paid"]),
    estimated: sum(["estimated"]),
    reserved: sum(["reserved"]) + allocated,
    adjustment: sum(["adjustment", "reversed"]),
  };
}
export function payout(currency: "HKD" | "JPY", key: string) {
  return command("payout:" + key, { currency }, (s) => {
    if (s.session!.role !== "owner") fail("FORBIDDEN");
    if (
      s.payouts.some(
        (p) =>
          p.owner === s.session!.id &&
          p.currency === currency &&
          !["failed", "cancelled"].includes(p.state),
      )
    )
      fail("ALREADY_RESERVED");
    const v = earningsView(currency, "2026-09-01", "2026-09-30");
    if (v.eligible <= 0) fail("NO_BALANCE");
    const p = {
      id: id("payout"),
      owner: s.session!.id,
      currency,
      amount: v.eligible,
      state: "reserved" as const,
      allocations: v.entries
        .filter((e) => ["eligible", "adjustment", "reversed"].includes(e.state))
        .map((e) => e.id),
    };
    s.payouts.push(p);
    return p;
  });
}
export const labels: Record<EState, I18n> = {
  estimated: w("Estimated", "預估"),
  pending: w("Awaiting confirmation", "待確認"),
  held: w("On hold", "暫緩"),
  eligible: w("Ready to settle", "可結算"),
  reserved: w("In progress", "處理中"),
  paid: w("Paid", "已支付"),
  adjustment: w("Adjustment", "退款調整"),
  reversed: w("Reversed", "已撤銷"),
  reconciliation_hold: w("Being reconciled", "款項核對中"),
};

/** Retained photography submissions share their original store; review never mints earnings. */
export function reviewMission(
  row: Store["missions"][number],
  state: "review" | "approved" | "rejected",
  feedback: string,
  key: string,
) {
  return command("merchantReview:" + key, { row, state, feedback }, (s) => {
    if (s.session?.role !== "merchant") fail("FORBIDDEN");
    const target = s.missions.find(
      (x) => x.id === row.id && x.owner === row.owner,
    );
    if (
      !target ||
      (target.revision || 0) !== (row.revision || 0) ||
      target.note !== row.note ||
      target.state !== row.state
    )
      fail("REVISION_CONFLICT");
    if (!["submitted", "review"].includes(target!.state))
      fail("STATE_CONFLICT");
    if (state === "rejected" && !feedback.trim()) fail("REASON_REQUIRED");
    target!.state = state;
    target!.revision = (target!.revision || 0) + 1;
    target!.feedback = feedback.trim().slice(0, 1000);
    return target!;
  });
}

export function submitMission(note: string, key: string) {
  return command("mission:" + key, { note }, (s) => {
    if (s.session?.role !== "owner") fail("FORBIDDEN");
    if (!note.trim() || note.length > 2000) fail("CONTRACT_ERROR");
    const existing = s.missions.find(
      (x) => x.id === "demo-mission-01" && x.owner === s.session!.id,
    );
    if (existing) {
      existing.note = note;
      existing.state = "submitted";
      existing.revision = (existing.revision || 0) + 1;
      return existing;
    }
    const row: Store["missions"][number] = {
      id: "demo-mission-01",
      owner: s.session!.id,
      state: "submitted",
      note,
      revision: 1,
    };
    s.missions.push(row);
    return row;
  });
}
