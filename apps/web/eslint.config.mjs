import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Test files probe loosely-typed runtime data (Supabase RPC results, Next Metadata
  // unions); allow `any` there while keeping it forbidden in production code.
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // OG cards are satori JSX rendered by next/og into a PNG — they never reach the
  // DOM, so `<img>` has no accessibility semantics and next/image cannot render
  // there. Both rules are unfixable-by-design here, and leaving them warning
  // teaches readers to scroll past a11y output, which is where a real one hides.
  {
    files: ["lib/seo/og/**/*.{ts,tsx}", "app/**/opengraph-image.tsx", "app/**/twitter-image.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
