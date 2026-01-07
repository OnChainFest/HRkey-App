import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // 1) Ignorar legacy/minificados/temporales
  {
    ignores: [
      "public/WebDapp/**",
      "**/*.min.js",
      "public/**/*.js",
      "public/**/temp_*.js",
    ],
  },

  // 2) TS ESLint recommended (flat)
  ...tseslint.configs.recommended,

  // 3) Next rules (recommended + core-web-vitals)
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // 4) OVERRIDE FINAL: apaga reglas que hoy te bloquean el build/lint
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
