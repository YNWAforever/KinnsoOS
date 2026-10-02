import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalRoot } from "../lib/canonical.ts";
test("existing site receives its lower-case locale without accepting a foreign origin", () => {
  assert.equal(canonicalRoot("zh-HK"), "https://remix-kinnso-web.vercel.app/zh-hk");
  assert.equal(canonicalRoot("en"), "https://remix-kinnso-web.vercel.app/en");
  assert.equal(new URL(canonicalRoot("https://evil.example")).origin, "https://remix-kinnso-web.vercel.app");
});
