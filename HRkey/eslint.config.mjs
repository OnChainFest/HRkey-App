import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

const shouldSkip =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.CI) ||
  process.env.NODE_ENV === "production";

export default shouldSkip
  ? []
  : [
      {
        ignores: [
          ".next/**",
          "node_modules/**",
          "out/**",
          "build/**",
          "next-env.d.ts",

          "public/WebDapp/**",
          "public/**/temp_*.js",
          "public/**/*.js",
          "**/*.min.js",
        ],
      },

      ...tseslint.configs.recommended,

      {
        plugins: { "@next/next": nextPlugin },
        rules: {
          ...nextPlugin.configs.recommended.rules,
          ...nextPlugin.configs["core-web-vitals"].rules,
        },
      },

      // ✅ LAST WINS
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
