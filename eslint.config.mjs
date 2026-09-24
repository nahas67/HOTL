import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/node_modules/**','**/.next/**','**/dist/**','**/.medusa/**','**/data/**','**/.data/**','**/.secrets/**','**/medusa/**','**/next-env.d.ts','**/.turbo/**','test-results/**','playwright-report/**','artifacts/**'] },
  ...tseslint.configs.recommended,
  { files:['**/*.{ts,tsx,js,mjs}'], rules: {
    '@typescript-eslint/no-unused-vars':'off',
    '@typescript-eslint/no-explicit-any':'off',
    '@typescript-eslint/no-empty-object-type':'off',
    'no-eval':'error', 'no-implied-eval':'error','no-new-func':'error','eqeqeq':['error','always',{'null':'ignore'}]
  }}
);
