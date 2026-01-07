// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // Next.js + TS defaults (App Router + Core Web Vitals)
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global ignores (STOP linting vendor/minified/public assets)
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",

      // ✅ critical: stop linting legacy WebDapp assets
      "public/WebDapp/**",
      "public/**/**/*.min.js",
      "public/**/**/*.min.css",
      "public/**/vendor/**",
      "public/**/lib/**",
      "public/**/libs/**",

      // temp scripts / scratch
      "public/**/temp_*.js",
      "**/temp_*.js",
    ],
  },

  // Optional: relax rules while V1 is in-flight (apply ONLY to src/)
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // If you want, keep as warning instead of error during V1
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
