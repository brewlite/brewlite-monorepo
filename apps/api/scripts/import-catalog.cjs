// Public catalog only: no users, orders, payments or inventory allocation.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const data = require('../prisma/catalog.json');
const db = new PrismaClient();
const normalize = (value) => value.trim().toLowerCase();
async function main() {
  if (!process.env.DATABASE_URL || process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('DATABASE_URL and optional --apply only');
  const target = new URL(process.env.DATABASE_URL);
  const apply = process.argv.includes('--apply');
  const counts = { categories: 0, products: 0, sizes: 0, toppings: 0 };
  await db.$transaction(async (tx) => {
    if (!apply) { await tx.$executeRaw`SET TRANSACTION READ ONLY`; await tx.$queryRaw`SELECT 1`; return; }
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7102026, 25)::text`;
    const categories = new Map(); const products = new Map();
    for (const item of data.categories) {
      let saved = await tx.category.findUnique({ where: { name: item.name } });
      if (!saved) { saved = await tx.category.create({ data: item }); counts.categories++; }
      categories.set(item.id, saved.id);
    }
    for (const item of data.products) {
      let saved = await tx.product.findUnique({ where: { id: item.id } }) || await tx.product.findFirst({ where: { name: item.name } });
      if (!saved) { saved = await tx.product.create({ data: { ...item, categoryId: item.categoryId ? categories.get(item.categoryId) : null, stockQuantity: 0 } }); counts.products++; }
      products.set(item.id, saved.id);
    }
    for (const item of data.sizes) {
      const productId = products.get(item.productId);
      const existing = await tx.size.findMany({ where: { productId }, select: { name: true } });
      if (!existing.some((row) => normalize(row.name) === normalize(item.name))) {
        await tx.size.create({ data: { ...item, productId, onHand: null, reserved: 0 } }); counts.sizes++;
      }
    }
    for (const item of data.toppings) {
      if (!await tx.topping.findUnique({ where: { name: item.name } })) { await tx.topping.create({ data: item }); counts.toppings++; }
    }
  }, { isolationLevel: 'Serializable', timeout: 30000 });
  console.log(JSON.stringify({ mode: apply ? 'APPLIED' : 'PREVIEW; use --apply to insert missing catalog only', database: target.pathname.slice(1), catalog: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])), inserted: counts, existingRows: 'unchanged', inventory: 'new Size onHand=NULL; existing inventory unchanged' }, null, 2));
}
main().catch((error) => { console.error(error.code || 'Catalog import failed; no credentials printed. Transaction rolled back.'); process.exitCode = 1; }).finally(() => db.$disconnect());
