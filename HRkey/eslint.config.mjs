import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // 1) Ignorar basura/minificados/legacy webdapp que no vamos a lint-ear
  {
    ignores: [
      "public/WebDapp/**",
      "**/*.min.js",
      "public/**/*.js",
      "public/**/temp_*.js",
    ],
  },

  // 2) TypeScript ESLint (recomendado) + override para NO bloquear por `any`
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      ...(cfg.rules ?? {}),
      // V1 pragmatic: no te bloquees por any todavía
      "@typescript-eslint/no-explicit-any": "off",
    },
  })),

  // 3) Next rules (recommended + core-web-vitals) aplicadas al src
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
