import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  // Ignorar TODO el vendor/legacy JS (minificados y esos temp_*.js)
  {
    ignores: [
      "public/WebDapp/**",
      "**/*.min.js",
      "public/**/*.js",
    ],
  },

  // TS recommended
  ...tseslint.configs.recommended,

  // Next.js rules (flat config)
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
