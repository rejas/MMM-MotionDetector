import {defineConfig} from "eslint/config";
import globals from "globals";
import {flatConfigs as importX} from "eslint-plugin-import-x";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import stylistic from "@stylistic/eslint-plugin";

export default defineConfig([
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        config: "readonly"
      }
    },
    plugins: {js, stylistic},
    extends: [importX.recommended, "js/all", "stylistic/all"],
    rules: {
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/function-paren-newline": ["error", "consistent"],
      "@stylistic/indent": ["error", 2],
      "@stylistic/multiline-comment-style": "off",
      "@stylistic/multiline-ternary": ["error", "always-multiline"],
      "@stylistic/no-multi-spaces": ["error", {ignoreEOLComments: true}],
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/quote-props": ["error", "as-needed"],
      "capitalized-comments": "off",
      "default-case": "off",
      "func-style": "off",
      "id-length": "off",
      "init-declarations": "off",
      "line-comment-position": "off",
      "max-lines": "off",
      "max-lines-per-function": ["warn", 120],
      "max-statements": ["warn", 40],
      "multiline-comment-style": "off",
      "no-inline-comments": "off",
      "no-magic-numbers": "off",
      "no-ternary": "off",
      "no-warning-comments": "off",
      "one-var": ["error", "never"],
      "prefer-destructuring": "off",
      "sort-keys": "off",
      strict: "off"
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node
      },
      sourceType: "module"
    },
    plugins: {js, stylistic},
    extends: [importX.recommended, "js/all", "stylistic/all"],
    rules: {
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/function-paren-newline": "off",
      "@stylistic/indent": ["error", 2],
      "@stylistic/object-property-newline": ["error", {allowAllPropertiesOnSameLine: true}],
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/quote-props": ["error", "as-needed"],
      "func-style": "off",
      "import-x/no-unresolved": ["error", {ignore: ["eslint/config"]}],
      "no-magic-numbers": "off",
      "one-var": ["error", "never"],
      "prefer-destructuring": ["error", {array: false, object: true}],
      "sort-keys": "off"
    }
  },
  {files: ["**/*.json"], ignores: ["package-lock.json"], plugins: {json}, extends: ["json/recommended"], language: "json/json"},
  {files: ["**/*.md"], plugins: {markdown}, language: "markdown/gfm", extends: ["markdown/recommended"]}
]);
