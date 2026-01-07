// eslint.config.mjs
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/WebDapp/**",
      "public/**/temp_*.js",
      "public/**/*.js",
      "**/*.min.js",
    ],
  },

  // TS recommended
  ...tseslint.configs.recommended,

  // Next rules
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // ✅ OVERRIDE GLOBAL (sin `files:` para que aplique sí o sí)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": 0,
      "react/no-unescaped-entities": 0,

      // opcional: que no te rompa por warnings
      "@typescript-eslint/no-unused-vars": 1,
      "@next/next/no-img-element": 1,
    },
  },
];
