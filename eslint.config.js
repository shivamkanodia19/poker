import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "dist-app/**", "node_modules/**", "scripts/**"] },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // Browser + ES2022 globals
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 }
    }
  },

  // App-specific: React hooks rules
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },

  // Engine src: no DOM globals needed
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.es2022 }
    }
  }
];
