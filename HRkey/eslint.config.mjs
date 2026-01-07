import next from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  // ✅ 1) Ignorar vendor/legacy/minified JS (NO lo lintées)
  {
    ignores: [
      "public/WebDapp/**",
      "**/*.min.js",
      "public/**/*.js",
    ],
  },

  // ✅ 2) Reglas recomendadas para TS
  ...tseslint.configs.recommended,

  // ✅ 3) Reglas Next.js
  {
    plugins: { "@next/next": next },
    rules: {
      // Puedes ir ajustando luego; por ahora dejamos lo base.
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
];
