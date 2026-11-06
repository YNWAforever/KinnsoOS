import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalRoot } from "../lib/canonical.ts";
test("consolidated site receives a supported locale without accepting a foreign origin", () => {
  assert.equal(canonicalRoot("zh-HK"), "https://kinnso-os.vercel.app/zh-HK");
  assert.equal(canonicalRoot("en"), "https://kinnso-os.vercel.app/en");
  assert.equal(new URL(canonicalRoot("https://evil.example")).origin, "https://kinnso-os.vercel.app");
});
