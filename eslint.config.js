import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: [
      "src/plugin/register.ts",
      "src/provider/responses-shared.ts",
      "src/provider/stream.ts",
      "src/provider/transform-messages.ts"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
