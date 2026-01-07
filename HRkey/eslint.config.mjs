import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // 1) IGNORA TODO lo que NO es tu código fuente (legacy/minificados/public assets)
  {
    ignores: [
      "public/**",
      "**/*.min.js",
      "**/*.min.css",
      "src/**/*.generated.*",
    ],
  },

  // 2) APLICA TypeScript-eslint SOLO a tu código TS/TSX
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["src/**/*.{ts,tsx}"],
  })),

  // 3) APLICA reglas de Next SOLO a tu código JS/TS dentro de src
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
