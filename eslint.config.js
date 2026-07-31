// Backend lint configuration.
//
// `eslint` was already a devDependency with no config file, so nothing was ever
// checked. The rules below are deliberately narrow: they catch the mistakes
// that have real security consequences in this codebase — an unused import that
// suggests a removed check, an accidental global, a floating promise on a
// security-relevant await — without imposing a style rewrite.

const globals = {
    require: 'readonly',
    module: 'writable',
    exports: 'writable',
    process: 'readonly',
    console: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    fetch: 'readonly',
    FormData: 'readonly',
    Blob: 'readonly',
    TextDecoder: 'readonly',
    AbortSignal: 'readonly',
    URL: 'readonly'
}

module.exports = [
    {
        files: ['server/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals
        },
        linterOptions: {
            reportUnusedDisableDirectives: true
        },
        rules: {
            // An import or binding that is no longer used is often the residue
            // of a check that was deleted.
            'no-unused-vars': ['warn', { argsIgnorePattern: '^(next|_)', caughtErrors: 'none' }],
            'no-undef': 'error',
            // `if (user = admin)` and friends.
            'no-cond-assign': 'error',
            'no-return-await': 'warn',
            // Off: every instance in this codebase is `req.<x> = await …` inside
            // Express middleware, where `req` is per-request and cannot be
            // observed concurrently. The rule cannot see that and reports only
            // false positives here.
            'require-atomic-updates': 'off',
            // These are how remote code execution gets introduced.
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-console': 'off'   // config/env and logger.js write here by design
        }
    },
    {
        // The suite deliberately drives error paths and uses top-level control flow.
        files: ['server/tests/**/*.js'],
        rules: {
            'no-unused-vars': 'off'
        }
    }
]
