// Read-only public post-deployment checks. Never log response bodies/cookies.
const base = new URL(process.argv[2] ?? process.env.FRONTEND_ORIGIN ?? '');
if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('HTTPS required');
for (const route of ['/api/health', '/api/products', '/', '/menu', '/login']) {
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw Error(`Smoke failed: ${route} HTTP ${response.status}`);
  if (route === '/api/health' && (await response.json()).status !== 'ok') throw Error('Invalid health contract');
  if (route === '/api/products' && !Array.isArray(await response.json())) throw Error('Invalid product contract');
  console.log(`PASS ${route} HTTP ${response.status}`);
}
