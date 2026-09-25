import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * House rules for the instruments bench (docs/phase-10-tools-plan.md §4).
     *
     * These are the mistakes that do not look like mistakes. A password
     * generator on `Math.random()` renders identically to one that is safe; an
     * expression calculator on `eval` works perfectly until someone pastes a
     * payload; a "preview" that reaches for innerHTML turns every tool that
     * accepts pasted text into an XSS sink. Reviews miss all three. The linter
     * does not.
     */
    files: [
      'src/tools/**/*.{ts,tsx}',
      'src/lib/tools/**/*.{ts,tsx}',
      'src/components/tools/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Not a secret source. Use src/lib/tools/random.ts, which samples crypto.getRandomValues without modulo bias.',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
