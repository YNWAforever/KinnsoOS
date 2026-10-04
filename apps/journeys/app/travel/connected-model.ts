/** Isolated device-local commerce adapter. No production APIs, credentials or money. */
import {
  type Locale,
  AppError,
  check,
  id,
  read as travelRead,
  w,
  I18n,
} from "./model";
export const environment = "demo" as const;
export const COMMERCE_KEY = "kinnso-journeys:commerce-demo:v3";
export type Campaign = {
  id: string;
  merchant: string;
  revision: number;
  name: string;
  goal: "visits" | "enquiries" | "bookings" | "content";
  audience: string;
  benefit: string;
  budget: number;
  reward: number;
  validUntil: string;
  brief: string;
  terms: string;
  state: "draft" | "active" | "completed";
  funding: "unfunded" | "sample-funded";
  step: number;
};
export type Partner = {
  id: string;
  name: string;
  destination: string;
  language: string;
  route: string;
  reason: I18n;
  kind: "paid" | "affiliate" | "hybrid" | "cashback";
};
export const partners: Partner[] = [
  {
    id: "demo-owner",
    name: "Jamie",
    destination: "hong-kong",
    language: "English / 繁中",
    route: "hong-kong-after-last-train",
    reason: w(
      "Hong Kong neighbourhood content · English and Traditional Chinese",
      "香港街區內容・英文及繁體中文",
    ),
    kind: "hybrid",
  },
  {
    id: "demo-partner-chloe",
    name: "Chloe",
    destination: "hong-kong",
    language: "English / 繁中",
    route: "hong-kong-after-last-train",
    reason: w(
      "Hong Kong walking routes · local evening discoveries",
      "香港步行路線・夜間街區探索",
    ),
    kind: "paid",
  },
  {
    id: "demo-partner-mika",
    name: "Mika",
    destination: "kyoto",
    language: "English / 日本語",
    route: "kyoto-slow-days",
    reason: w(
      "Kyoto slow travel · published two-day itinerary",
      "京都慢旅行・已備兩日路線",
    ),
    kind: "affiliate",
  },
  {
    id: "demo-partner-ines",
    name: "Inês",
    destination: "lisbon",
    language: "English / Português",
    route: "lisbon-beyond-the-postcard",
    reason: w(
      "Lisbon neighbourhood knowledge · three-day route",
      "里斯本街區知識・三日路線",
    ),
    kind: "cashback",
  },
];
export type Participation = {
  id: string;
  campaignId: string;
  creatorId: string;
  state:
    | "shortlisted"
    | "invited"
    | "applied"
    | "active"
    | "submitted"
    | "changes"
    | "approved"
    | "rejected";
  note: string;
  submission: string;
  feedback: string;
  revision: number;
};
export type Offer = {
  id: string;
  merchant: string;
  name: I18n;
  benefit: I18n;
  validUntil: string;
  capacity: number;
  minimumSpend: number;
  enabled: boolean;
  revision: number;
  slug: string;
  stopId: string;
};
export type Claim = {
  id: string;
  owner: string;
  offerId: string;
  merchant: string;
  code: string;
  createdAt: string;
  state: "claimed" | "redeemed";
  source: { slug: string; version: number; creator: string };
  outcomeId?: string;
};
export type Contract = {
  id: string;
  offerId: string;
  campaignId: string;
  partnerId: string;
  merchant: string;
  currency: "HKD";
  reward: number;
  state: "accepted";
  acceptedAt: string;
  validUntil: string;
  terms: string;
};
export type Outcome = {
  id: string;
  claimId: string;
  offerId: string;
  merchant: string;
  campaignId: string;
  contractId: string;
  partnerId: string;
  termsSnapshot: string;
  source: Claim["source"];
  verifiedAt: string;
  spend: number;
  reward: number;
  currency: "HKD";
  state: "pending" | "eligible" | "reversed";
  evidence: string;
  adjustmentReason?: string;
  paymentReference: null;
};
export type Commerce = {
  schema: 1;
  contracts: Contract[];
  campaigns: Campaign[];
  participants: Participation[];
  offers: Offer[];
  claims: Claim[];
  outcomes: Outcome[];
  requests: Record<string, { hash: string; result: unknown }>;
  events: { id: string; type: string; entityId: string; at: string }[];
};
export const seed = (): Commerce => ({
  schema: 1,
  contracts: [
    {
      id: "demo-referral-hk",
      offerId: "demo-offer-hk",
      campaignId: "demo-campaign-hk",
      partnerId: "demo-owner",
      merchant: "demo-merchant",
      currency: "HKD",
      reward: 20,
      state: "accepted",
      acceptedAt: "2026-09-01T00:00:00Z",
      validUntil: "2026-12-31",
      terms:
        "Fictional pre-accepted referral agreement: Jamie receives HKD 20 only after a unique qualified redemption is reviewed against evidence; reversed events excluded. Separate from route credit Chloe and content-fee work.",
    },
  ],
  campaigns: [
    {
      id: "demo-campaign-hk",
      merchant: "demo-merchant",
      revision: 1,
      name: "Temple Street, a slower evening",
      goal: "visits",
      audience: "Hong Kong · independent travellers",
      benefit: "A complimentary tea with HKD 80 qualifying spend",
      budget: 2400,
      reward: 20,
      validUntil: "2026-12-31",
      brief:
        "One useful neighbourhood recommendation, 3 original photographs and a clear sponsorship disclosure.",
      terms:
        "Sample hybrid agreement: HKD 600 content fee after authorised review; HKD 20 per eligible verified referral. Cancellations and duplicate visits excluded. Payment requires separate reconciliation.",
      state: "active",
      funding: "sample-funded",
      step: 4,
    },
  ],
  participants: [],
  offers: [
    {
      id: "demo-offer-hk",
      merchant: "demo-merchant",
      name: w("A tea break near Temple Street", "廟街附近，停一停飲杯茶"),
      benefit: w(
        "Complimentary tea with HKD 80 qualifying spend",
        "合資格消費滿 HKD 80，獲贈一杯茶",
      ),
      validUntil: "2026-12-31",
      capacity: 50,
      minimumSpend: 80,
      enabled: true,
      revision: 1,
      slug: "hong-kong-after-last-train",
      stopId: "h-2",
    },
  ],
  claims: [
    {
      id: "demo-claim-fixture",
      owner: "demo-traveller-fixture",
      offerId: "demo-offer-hk",
      merchant: "demo-merchant",
      code: "DEMO-VALID",
      createdAt: "2026-09-10T00:00:00Z",
      state: "claimed",
      source: {
        slug: "hong-kong-after-last-train",
        version: 1,
        creator: "chloe",
      },
    },
  ],
  outcomes: [],
  requests: {},
  events: [],
});
function valid(v: unknown): Commerce {
  const s = v as Commerce,
    fail = () => {
      throw new AppError("CONTRACT_ERROR");
    },
    text = (x: unknown, max = 2000) => typeof x === "string" && x.length <= max,
    identifier = (x: unknown) => typeof x === "string" && x.startsWith("demo-"),
    money = (x: unknown) =>
      typeof x === "number" && Number.isSafeInteger(x) && x >= 0,
    date = (x: unknown) =>
      typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      !isNaN(Date.parse(x)) &&
      new Date(x).toISOString().slice(0, 10) === x,
    revision = (x: unknown) =>
      typeof x === "number" && Number.isInteger(x) && x >= 1;
  if (
    !s ||
    s.schema !== 1 ||
    !s.requests ||
    typeof s.requests !== "object" ||
    Array.isArray(s.requests)
  )
    fail();
  for (const field of [
    "contracts",
    "campaigns",
    "participants",
    "offers",
    "claims",
    "outcomes",
    "events",
  ] as const) {
    if (!Array.isArray(s[field])) fail();
    const ids = s[field].map((x) => x?.id);
    if (ids.some((x) => !identifier(x)) || new Set(ids).size !== ids.length)
      fail();
  }
  for (const c of s.campaigns)
    if (
      !identifier(c.merchant) ||
      !revision(c.revision) ||
      !money(c.budget) ||
      !money(c.reward) ||
      !text(c.name, 120) ||
      !text(c.audience, 300) ||
      !text(c.benefit, 300) ||
      !text(c.brief) ||
      !text(c.terms) ||
      !["visits", "enquiries", "bookings", "content"].includes(c.goal) ||
      !["draft", "active", "completed"].includes(c.state) ||
      !["unfunded", "sample-funded"].includes(c.funding) ||
      (c.validUntil !== "" && !date(c.validUntil)) ||
      ![1, 2, 3, 4].includes(c.step)
    )
      fail();
  for (const o of s.offers)
    if (
      !identifier(o.merchant) ||
      !revision(o.revision) ||
      !money(o.capacity) ||
      !money(o.minimumSpend) ||
      !date(o.validUntil) ||
      typeof o.enabled !== "boolean" ||
      !text(o.name?.en) ||
      !text(o.name?.["zh-HK"]) ||
      !text(o.benefit?.en) ||
      !text(o.benefit?.["zh-HK"]) ||
      !text(o.slug) ||
      !text(o.stopId)
    )
      fail();
  for (const p of s.participants)
    if (
      !revision(p.revision) ||
      !partners.some((x) => x.id === p.creatorId) ||
      !s.campaigns.some((c) => c.id === p.campaignId) ||
      ![
        "shortlisted",
        "invited",
        "applied",
        "active",
        "submitted",
        "changes",
        "approved",
        "rejected",
      ].includes(p.state) ||
      !text(p.note, 1000) ||
      !text(p.submission) ||
      !text(p.feedback, 1000)
    )
      fail();
  for (const k of s.contracts)
    if (
      !s.offers.some((o) => o.id === k.offerId && o.merchant === k.merchant) ||
      !s.campaigns.some(
        (c) => c.id === k.campaignId && c.merchant === k.merchant,
      ) ||
      !partners.some((p) => p.id === k.partnerId) ||
      k.state !== "accepted" ||
      !money(k.reward) ||
      k.currency !== "HKD" ||
      !date(k.validUntil) ||
      !text(k.terms) ||
      isNaN(Date.parse(k.acceptedAt))
    )
      fail();
  for (const c of s.claims)
    if (
      !identifier(c.owner) ||
      !s.offers.some((o) => o.id === c.offerId && o.merchant === c.merchant) ||
      !["claimed", "redeemed"].includes(c.state) ||
      !text(c.code, 80) ||
      !c.code.startsWith("DEMO-") ||
      isNaN(Date.parse(c.createdAt)) ||
      !text(c.source?.slug) ||
      !text(c.source?.creator) ||
      !revision(c.source?.version) ||
      (c.state === "redeemed" &&
        !s.outcomes.some((o) => o.id === c.outcomeId && o.claimId === c.id))
    )
      fail();
  if (new Set(s.claims.map((c) => c.code)).size !== s.claims.length) fail();
  for (const o of s.outcomes)
    if (
      !["pending", "eligible", "reversed"].includes(o.state) ||
      !money(o.spend) ||
      !money(o.reward) ||
      o.currency !== "HKD" ||
      o.paymentReference !== null ||
      !text(o.evidence, 500) ||
      !text(o.termsSnapshot) ||
      isNaN(Date.parse(o.verifiedAt)) ||
      !s.claims.some(
        (c) =>
          c.id === o.claimId &&
          c.merchant === o.merchant &&
          c.offerId === o.offerId &&
          c.outcomeId === o.id,
      ) ||
      !s.contracts.some(
        (k) =>
          k.id === o.contractId &&
          k.partnerId === o.partnerId &&
          k.offerId === o.offerId &&
          k.campaignId === o.campaignId &&
          k.reward === o.reward &&
          k.terms === o.termsSnapshot,
      )
    )
      fail();
  if (new Set(s.outcomes.map((o) => o.claimId)).size !== s.outcomes.length)
    fail();
  for (const [key, r] of Object.entries(s.requests))
    if (
      !key.startsWith("demo-") ||
      !r ||
      typeof r.hash !== "string" ||
      !r.result ||
      typeof r.result !== "object"
    )
      fail();
  for (const e of s.events)
    if (!text(e.type) || !identifier(e.entityId) || isNaN(Date.parse(e.at)))
      fail();
  return s;
}
export function readCommerce(): Commerce {
  if (typeof localStorage === "undefined") return seed();
  try {
    const raw = localStorage.getItem(COMMERCE_KEY);
    return raw ? valid(JSON.parse(raw)) : seed();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("STORAGE_ERROR");
  }
}
function persist(s: Commerce) {
  valid(s);
  try {
    localStorage.setItem(COMMERCE_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("kinnso-commerce-change"));
  } catch {
    throw new AppError("STORAGE_ERROR");
  }
}
function actor(roles: string[]) {
  const a = travelRead().session;
  if (!a) throw new AppError("SIGN_IN_REQUIRED");
  if (!roles.includes(a.role)) throw new AppError("FORBIDDEN");
  return a;
}
function mutate<T>(
  kind: string,
  key: string,
  payload: unknown,
  roles: string[],
  fn: (s: Commerce, actorId: string) => T,
): T {
  const a = actor(roles);
  check();
  const s = readCommerce(),
    request = a.id + ":" + kind + ":" + key,
    hash = JSON.stringify(payload),
    old = s.requests[request];
  if (old) {
    if (old.hash !== hash) throw new AppError("IDEMPOTENCY_CONFLICT");
    return structuredClone(old.result as T);
  }
  const result = fn(s, a.id);
  s.requests[request] = { hash, result };
  persist(s);
  return result;
}
function event(s: Commerce, type: string, entityId: string) {
  s.events.push({
    id: id("event"),
    type,
    entityId,
    at: new Date().toISOString(),
  });
}
export function saveCampaign(input: Campaign, expected: number, key: string) {
  return mutate("campaign", key, { input, expected }, ["merchant"], (s, a) => {
    if (input.merchant !== a || !input.id.startsWith("demo-"))
      throw new AppError("FORBIDDEN");
    const old = s.campaigns.find((c) => c.id === input.id);
    if (old && old.revision !== expected)
      throw new AppError("REVISION_CONFLICT");
    const row = {
      ...input,
      revision: (old?.revision || 0) + 1,
      state: old?.state || "draft",
      funding: old?.funding || "unfunded",
    } as Campaign;
    s.campaigns = s.campaigns.filter((c) => c.id !== row.id).concat(row);
    return row;
  });
}
export function activateCampaign(cid: string, revision: number, key: string) {
  return mutate("activate", key, { cid, revision }, ["merchant"], (s, a) => {
    const c = s.campaigns.find((c) => c.id === cid && c.merchant === a);
    if (!c) throw new AppError("FORBIDDEN");
    if (c.revision !== revision) throw new AppError("REVISION_CONFLICT");
    if (
      !c.name.trim() ||
      !c.audience.trim() ||
      !c.brief.trim() ||
      !c.terms.trim() ||
      c.budget <= 0 ||
      !c.validUntil ||
      c.validUntil < new Date().toISOString().slice(0, 10)
    )
      throw new AppError("CAMPAIGN_INCOMPLETE");
    c.state = "active";
    c.funding = "sample-funded";
    c.revision++;
    event(s, "demo_campaign_activated", cid);
    return c;
  });
}
export function partnerAction(
  cid: string,
  pid: string,
  action:
    | "shortlist"
    | "invite"
    | "apply"
    | "accept"
    | "approve"
    | "changes"
    | "reject"
    | "submit"
    | "note",
  text: string,
  key: string,
  expected?: number,
) {
  const merchant = [
    "shortlist",
    "invite",
    "approve",
    "changes",
    "reject",
    "note",
  ].includes(action);
  return mutate(
    "partner",
    key,
    { cid, pid, action, text, expected },
    merchant ? ["merchant"] : ["owner"],
    (s, a) => {
      const c = s.campaigns.find((c) => c.id === cid);
      if (
        !c ||
        (merchant && c.merchant !== a) ||
        (!merchant && pid !== a) ||
        !partners.some((p) => p.id === pid)
      )
        throw new AppError("FORBIDDEN");
      let p = s.participants.find(
        (p) => p.campaignId === cid && p.creatorId === pid,
      );
      const state = p?.state;
      if (expected !== undefined && (p?.revision || 0) !== expected)
        throw new AppError("REVISION_CONFLICT");
      if (action === "invite") {
        if (c.state !== "active") throw new AppError("CAMPAIGN_NOT_ACTIVE");
        if (state && state !== "shortlisted")
          throw new AppError("STATE_CONFLICT");
        if (
          s.participants.filter(
            (p) =>
              p.campaignId === cid &&
              p.state !== "shortlisted" &&
              p.state !== "rejected",
          ).length >= 3
        )
          throw new AppError("INVITE_QUOTA");
      }
      if (
        action === "apply" &&
        (c.state !== "active" ||
          (state && !["shortlisted", "rejected"].includes(state)))
      )
        throw new AppError("STATE_CONFLICT");
      if (action === "accept" && state !== "invited")
        throw new AppError("STATE_CONFLICT");
      if (
        action === "submit" &&
        (!["active", "changes"].includes(state || "") || !text.trim())
      )
        throw new AppError("STATE_CONFLICT");
      if (
        action === "approve" &&
        !["applied", "submitted"].includes(state || "")
      )
        throw new AppError("STATE_CONFLICT");
      if (
        ["changes", "reject"].includes(action) &&
        (!["submitted", "applied"].includes(state || "") || !text.trim())
      )
        throw new AppError("REASON_REQUIRED");
      if (!p) {
        p = {
          id: id("participation"),
          campaignId: cid,
          creatorId: pid,
          state: "shortlisted",
          note: "",
          submission: "",
          feedback: "",
          revision: 0,
        };
        s.participants.push(p);
      }
      if (action === "note") p.note = text.slice(0, 1000);
      else if (action === "shortlist") {
        if (state && state !== "shortlisted")
          throw new AppError("STATE_CONFLICT");
      } else if (action === "invite") p.state = "invited";
      else if (action === "apply") p.state = "applied";
      else if (action === "accept") p.state = "active";
      else if (action === "submit") {
        p.state = "submitted";
        p.submission = text.slice(0, 2000);
      } else if (action === "approve") {
        p.state = state === "applied" ? "active" : "approved";
        p.feedback = text.slice(0, 1000);
      } else {
        p.state = action === "changes" ? "changes" : "rejected";
        p.feedback = text.slice(0, 1000);
      }
      p.revision++;
      event(s, "demo_participation_" + action, p.id);
      return p;
    },
  );
}
export function claimOffer(offerId: string, key: string) {
  return mutate("claim", key, { offerId }, ["owner", "editor"], (s, a) => {
    const o = s.offers.find((o) => o.id === offerId);
    if (!o || !o.enabled) throw new AppError("OFFER_UNAVAILABLE");
    if (o.validUntil < new Date().toISOString().slice(0, 10))
      throw new AppError("CODE_EXPIRED");
    const existing = s.claims.find(
      (c) => c.owner === a && c.offerId === offerId,
    );
    if (existing) return existing;
    if (s.claims.filter((c) => c.offerId === offerId).length >= o.capacity)
      throw new AppError("OFFER_FULL");
    const c: Claim = {
      id: id("claim"),
      owner: a,
      offerId,
      merchant: o.merchant,
      code: "DEMO-" + id("code").slice(-12).toUpperCase(),
      state: "claimed",
      createdAt: new Date().toISOString(),
      source: { slug: o.slug, version: 1, creator: "chloe" },
    };
    s.claims.push(c);
    event(s, "offer_claimed", c.id);
    return c;
  });
}
export function inspectCode(code: string) {
  const a = actor(["merchant"]),
    s = readCommerce(),
    token = code.trim().toUpperCase();
  if (token === "DEMO-EXPIRED") throw new AppError("CODE_EXPIRED");
  if (token === "DEMO-FOREIGN") throw new AppError("CODE_FOREIGN");
  if (token === "DEMO-USED") throw new AppError("CODE_USED");
  if (token === "DEMO-UNCERTAIN") throw new AppError("REDEMPTION_UNCERTAIN");
  const c = s.claims.find((c) => c.code === token);
  if (!c) throw new AppError("CODE_INVALID");
  if (c.merchant !== a.id) throw new AppError("CODE_FOREIGN");
  const o = s.offers.find((o) => o.id === c.offerId);
  const existing = s.outcomes.find((v) => v.claimId === c.id);
  if (existing && o) return { claim: c, offer: o, outcome: existing };
  if (!o?.enabled) throw new AppError("OFFER_UNAVAILABLE");
  if (o.validUntil < new Date().toISOString().slice(0, 10))
    throw new AppError("CODE_EXPIRED");
  return {
    claim: c,
    offer: o,
    outcome: s.outcomes.find((v) => v.claimId === c.id),
  };
}
export function redeem(
  code: string,
  spend: number,
  evidence: string,
  key: string,
) {
  return mutate(
    "redeem",
    key,
    { code, spend, evidence },
    ["merchant"],
    (s, a) => {
      const previousClaim = s.claims.find(
        (c) => c.code === code.trim().toUpperCase() && c.merchant === a,
      );
      const existing = s.outcomes.find(
        (o) => o.claimId === previousClaim?.id && o.merchant === a,
      );
      if (existing) return { outcome: existing, reused: true };
      const match = inspectCode(code);
      if (
        !Number.isSafeInteger(spend) ||
        spend < match.offer.minimumSpend ||
        !evidence.trim()
      )
        throw new AppError("EVIDENCE_REQUIRED");
      const claim = s.claims.find((c) => c.id === match.claim.id)!;
      const contract = s.contracts.find(
        (k) =>
          k.offerId === claim.offerId &&
          k.merchant === a &&
          k.state === "accepted" &&
          k.validUntil >= new Date().toISOString().slice(0, 10),
      );
      if (!contract) throw new AppError("CONTRACT_UNAVAILABLE");
      const campaign = s.campaigns.find(
        (x) =>
          x.id === contract.campaignId &&
          x.merchant === a &&
          x.state === "active" &&
          x.funding === "sample-funded",
      );
      if (!campaign) throw new AppError("CONTRACT_UNAVAILABLE");
      const outcome: Outcome = {
        id: id("outcome"),
        claimId: claim.id,
        offerId: claim.offerId,
        merchant: a,
        campaignId: contract.campaignId,
        contractId: contract.id,
        partnerId: contract.partnerId,
        termsSnapshot: contract.terms,
        source: claim.source,
        verifiedAt: new Date().toISOString(),
        spend,
        reward: contract.reward,
        currency: contract.currency,
        state: "pending",
        evidence: evidence.slice(0, 500),
        paymentReference: null,
      };
      s.outcomes.push(outcome);
      claim.state = "redeemed";
      claim.outcomeId = outcome.id;
      event(s, "offer_redeemed_verified", outcome.id);
      return { outcome, reused: false };
    },
  );
}
export function reconcileEligibility(
  oid: string,
  decision: "eligible" | "reversed",
  reason: string,
  key: string,
) {
  return mutate("eligibility", key, { oid, decision, reason }, ["ops"], (s) => {
    const o = s.outcomes.find((o) => o.id === oid);
    if (!o) throw new AppError("CONTRACT_ERROR");
    if (!reason.trim()) throw new AppError("REASON_REQUIRED");
    const agreement = s.contracts.find(
      (k) =>
        k.id === o.contractId &&
        k.offerId === o.offerId &&
        k.partnerId === o.partnerId &&
        k.merchant === o.merchant &&
        k.state === "accepted" &&
        k.reward === o.reward &&
        k.terms === o.termsSnapshot,
    );
    if (!agreement) throw new AppError("CONTRACT_UNAVAILABLE");
    if (o.state === decision) return o;
    if (o.state === "reversed") throw new AppError("STATE_CONFLICT");
    o.state = decision;
    o.adjustmentReason = reason.slice(0, 500);
    event(
      s,
      decision === "eligible"
        ? "earning_became_eligible"
        : "demo_earning_reversed",
      o.id,
    );
    return o;
  });
}
export function updateOffer(offer: Offer, key: string) {
  return mutate("offer", key, offer, ["merchant"], (s, a) => {
    const o = s.offers.find((o) => o.id === offer.id && o.merchant === a);
    if (!o) throw new AppError("FORBIDDEN");
    if (o.revision !== offer.revision) throw new AppError("REVISION_CONFLICT");
    if (
      !Number.isInteger(offer.capacity) ||
      offer.capacity < s.claims.filter((c) => c.offerId === o.id).length ||
      !offer.validUntil
    )
      throw new AppError("CONTRACT_ERROR");
    o.capacity = offer.capacity;
    o.validUntil = offer.validUntil;
    o.enabled = offer.enabled;
    o.revision++;
    return o;
  });
}
export function exportCommerce() {
  const a = travelRead().session;
  if (!a) throw new AppError("SIGN_IN_REQUIRED");
  const actorId = a.id,
    s = readCommerce();
  return {
    mode: "demo",
    scope: "current account",
    campaigns: s.campaigns.filter((c) => c.merchant === actorId),
    participants: s.participants
      .filter(
        (p) =>
          p.creatorId === actorId ||
          s.campaigns.some(
            (c) => c.id === p.campaignId && c.merchant === actorId,
          ),
      )
      .map((p) => (p.creatorId === actorId ? { ...p, note: "" } : p)),
    claims: s.claims.filter((c) => c.owner === actorId),
    outcomes: s.outcomes
      .filter((o) => o.partnerId === actorId || o.merchant === actorId)
      .map((o) => (o.merchant === actorId ? o : { ...o, evidence: "" })),
  };
}
export function clearCommerce() {
  const a = travelRead().session;
  if (!a) throw new AppError("SIGN_IN_REQUIRED");
  const actorId = a.id,
    s = readCommerce();
  s.claims = s.claims.map((c) =>
    c.owner === actorId ? { ...c, owner: "demo-deleted-traveller" } : c,
  );
  s.participants = s.participants.filter((p) => p.creatorId !== actorId);
  if (a.role === "merchant") {
    const campaigns = new Set(
      s.campaigns.filter((c) => c.merchant === actorId).map((c) => c.id),
    );
    s.participants = s.participants.filter((p) => !campaigns.has(p.campaignId));
    s.offers
      .filter((o) => o.merchant === actorId)
      .forEach((o) => {
        o.enabled = false;
        o.revision++;
      });
    s.campaigns
      .filter((c) => c.merchant === actorId)
      .forEach((c) => {
        c.state = "completed";
        c.revision++;
      });
  }
  for (const k of Object.keys(s.requests))
    if (k.startsWith(actorId + ":")) delete s.requests[k];
  persist(s);
}

// Display-only translations of exact fixture strings; never rewrite authored text or contract snapshots.
const fixtureTranslations: Record<string, string> = {
  "Temple Street, a slower evening": "廟街，慢慢感受夜晚",
  "Hong Kong · independent travellers": "香港・獨立旅人",
  "A complimentary tea with HKD 80 qualifying spend":
    "合資格消費滿 HKD 80，獲贈一杯茶",
  "One useful neighbourhood recommendation, 3 original photographs and a clear sponsorship disclosure.":
    "一段實用街區推薦、三張原創照片，以及清晰的商業合作披露。",
  "Sample hybrid agreement: HKD 600 content fee after authorised review; HKD 20 per eligible verified referral. Cancellations and duplicate visits excluded. Payment requires separate reconciliation.":
    "示範混合報酬協議：內容經授權審閱後，內容費為 HKD 600；每次合資格核實推薦報酬為 HKD 20。取消及重複到訪不計算，付款需另行對帳。",
  "Fictional pre-accepted referral agreement: Jamie receives HKD 20 only after a unique qualified redemption is reviewed against evidence; reversed events excluded. Separate from route credit Chloe and content-fee work.":
    "預先接受的虛構推薦協議：獨立合資格核銷經證據審閱後，Jamie 才可獲 HKD 20。已撤銷事件不計算；此協議與 Chloe 的路線署名及內容費工作分開。",
};
export function fixtureText(value: string, locale: Locale) {
  return locale === "zh-HK" ? fixtureTranslations[value] || value : value;
}
export function campaignLabel(campaign: Campaign, locale: Locale) {
  return campaign.terms === seed().campaigns[0].terms
    ? w("Hybrid · sample programme", "混合報酬・示範計劃")[locale]
    : w("Merchant-defined terms · demo", "商戶自訂條款・示範")[locale];
}
