import js from "@eslint/js";
import ts from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript.js";
import eslintConfigPrettier from "eslint-config-prettier";

export default ts.config(
  {
    ignores: ["dist/**", "src/assets/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...ts.configs.recommended, solid],
  },
  eslintConfigPrettier,
);
