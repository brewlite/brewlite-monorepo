const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || '');
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/brewlite_payment_test'
) {
  throw new Error(
    'Use only local brewlite_payment_test; pass --env-file=.env.test locally.',
  );
}
function run(args, env) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const env = { ...process.env, NODE_ENV: 'test' };
const jest = [
  '--experimental-vm-modules',
  'node_modules/jest/bin/jest.js',
  '--config',
  'test/jest-e2e.json',
  '--runInBand',
  '--runTestsByPath',
];
run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
run(
  [
    ...jest,
    'test/payments-db.e2e-spec.ts',
    'test/payment-orders-http.e2e-spec.ts',
  ],
  env,
);
// Production AppModule is tested with real login/cookie auth in a fresh schema.
url.searchParams.set('schema', 'brewlite_auth_test_payment_' + Date.now());
const shared = {
  ...env,
  DATABASE_URL: url.toString(),
  AUTH_TEST_DATABASE_URL: url.toString(),
  JWT_SECRET: randomBytes(48).toString('hex'),
  FRONTEND_ORIGIN: 'http://localhost:3000',
  MOCK_PAYMENT_OUTCOME: 'SUCCESS',
};
console.log('Shared app isolated schema:', url.searchParams.get('schema'));
run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], shared);
run(
  [
    ...jest,
    'test/app.e2e-spec.ts',
    'test/auth.e2e-spec.ts',
    'test/cart-pricing.e2e-spec.ts',
    'test/commerce.e2e-spec.ts',
  ],
  shared,
);
