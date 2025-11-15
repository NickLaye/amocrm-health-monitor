module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // Best Practices
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    'prefer-const': 'warn',
    'no-var': 'error',
    
    // Code Quality
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-implicit-coercion': 'warn',
    'no-param-reassign': 'warn',
    'no-return-await': 'warn',
    'prefer-template': 'warn',
    'prefer-arrow-callback': 'warn',
    
    // Error Prevention
    'no-throw-literal': 'error',
    'require-await': 'warn',
    'no-async-promise-executor': 'error',
    
    // Style
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', {
      arrays: 'only-multiline',
      objects: 'only-multiline',
      imports: 'never',
      exports: 'never',
      functions: 'never'
    }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'max-len': ['warn', { 
      code: 100, 
      ignoreComments: true, 
      ignoreStrings: true, 
      ignoreTemplateLiterals: true 
    }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-function-paren': ['error', {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }],
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
};

