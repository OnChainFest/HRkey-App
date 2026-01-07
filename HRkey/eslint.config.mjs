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
 * Goals:
 * - Avoid ESLintEmptyConfigWarning
 * - Ensure Next.js plugin is properly detected in local dev
 * - Skip linting in CI / Vercel / production builds
 * - Keep sane defaults for local development
 */

const isCI =
  process.env.VERCEL === "1" ||
  process.env.CI === "true" ||
  process.env.NODE_ENV === "production";

const config = isCI
  ? [
      // Explicit empty config to avoid ESLintEmptyConfigWarning
      // This intentionally disables linting in CI / production
      {},
    ]
  : [
      // Next.js recommended rules (App Router + Core Web Vitals)
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

export default config;
