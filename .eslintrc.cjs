/* eslint-env node */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: ['standard'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  },
  overrides: [
    {
      files: ['public/js/**/*.js'],
      env: { browser: true }
    }
  ]
}
