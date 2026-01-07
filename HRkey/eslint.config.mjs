import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    ignores: [
      "public/WebDapp/**",
      "**/*.min.js",
      "public/**/*.js",
      // temporales que te están rompiendo parsing
      "public/**/temp_*.js",
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
];
