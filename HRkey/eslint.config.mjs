// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * ESLint Flat Config for HRkey
 *
 * Notes:
 * - Next.js build already skips lint via next.config.ts (eslint.ignoreDuringBuilds = true)
 * - So we keep a real config here to avoid "empty config" warnings and ensure Next rules exist.
 */

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];
