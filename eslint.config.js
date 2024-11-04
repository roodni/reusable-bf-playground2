import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import solid from "eslint-plugin-solid/configs/typescript.js";
import ts from "typescript-eslint";

export default ts.config(
  {
    ignores: ["dist/**", "src/assets/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...ts.configs.recommended, solid],
    rules: {
      eqeqeq: "error",
    },
  },
  eslintConfigPrettier,
);
