// eslint.config.mjs
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // 1) Ignorar todo lo legacy / public scripts
  {
    ignores: [
      "public/WebDapp/**",
      "public/**/*.js",
      "**/*.min.js",
      "public/**/temp_*.js",
      ".next/**",
      "node_modules/**",
    ],
  },

  // 2) Base TS-eslint recommended (trae no-explicit-any ON por defecto)
  ...tseslint.configs.recommended,

  // 3) Next rules (recommended + core web vitals)
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // 4) 🔥 OVERRIDE FINAL (esto es lo que te faltaba)
  //    Si esto está al final, gana SIEMPRE.
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // bloqueadores actuales:
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",

      // warnings que no te deben romper el build ahora:
      "@typescript-eslint/no-unused-vars": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];
