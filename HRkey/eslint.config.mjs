// eslint.config.mjs
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

// ✅ Solo skip en Vercel/CI (NO por NODE_ENV=production)
const shouldSkip = Boolean(process.env.VERCEL) || Boolean(process.env.CI);

export default shouldSkip
  ? [{}] // evita ESLintEmptyConfigWarning en CI/VERCEL si igual llega a ejecutar eslint
  : [
      {
        ignores: [
          ".next/**",
          "node_modules/**",
          "out/**",
          "build/**",
          "next-env.d.ts",

          // legacy / temporales
          "public/WebDapp/**",
          "public/**/temp_*.js",
          "public/**/*.js",
          "**/*.min.js",
        ],
      },

      // TS rules base
      ...tseslint.configs.recommended,

      // Next rules
      {
        plugins: { "@next/next": nextPlugin },
        rules: {
          ...nextPlugin.configs.recommended.rules,
          ...nextPlugin.configs["core-web-vitals"].rules,
        },
      },

      // Overrides finales (LAST WINS)
      {
        files: ["**/*.{ts,tsx,js,jsx}"],
        rules: {
          "@typescript-eslint/no-explicit-any": "off",
          "react/no-unescaped-entities": "off",

          "@typescript-eslint/no-unused-vars": "warn",
          "@next/next/no-img-element": "warn",
        },
      },
    ];
