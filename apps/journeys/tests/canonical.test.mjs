import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalRoot } from "../lib/canonical.ts";
test("navigation roots stay on the current site and normalize the Hong Kong locale", () => {
  for (const [locale, expected] of [["en", "/en"], ["zh-HK", "/zh-HK"], ["zh-hk", "/zh-HK"], ["https://evil.example", "/en"]]) {
    const root = canonicalRoot(locale);
    assert.equal(root, expected);
    assert.equal(new URL(root + '/studio', 'https://kinnso-os.vercel.app').origin, 'https://kinnso-os.vercel.app');
  }
});
