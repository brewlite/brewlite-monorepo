// Additive catalog import. Preview by default; --apply is required to write.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const db = new PrismaClient();
const catalog = [
  ['Affogato', 'Affogato.jpg', 'Cà phê', 45000, 'Espresso đậm đà kết hợp kem vani mát lạnh.', false],
  ['Americano', 'americano.jpg', 'Cà phê', 29000, 'Espresso pha cùng nước, hương cà phê rõ và hậu vị thanh.'],
  ['Bạc Xỉu', 'bac-xiu.jpg', 'Cà phê', 32000, 'Sữa béo dịu hòa cùng cà phê thơm, vị ngọt nhẹ.'],
  ['Cà Phê Muối', 'ca-phe-muoi.jpg', 'Cà phê', 35000, 'Cà phê đậm vị cùng lớp kem muối béo mịn.'],
  ['Cà Phê Trứng', 'ca-phe-trung.jpg', 'Cà phê', 39000, 'Cà phê thơm nồng phủ lớp kem trứng mềm mịn.'],
  ['Cold Brew', 'cold-brew.jpg', 'Cà phê', 35000, 'Cà phê ủ lạnh, hương thơm dịu và vị thanh mát.'],
  ['Dalgona', 'dalgona.jpg', 'Cà phê', 39000, 'Sữa tươi kết hợp lớp cà phê đánh bông thơm béo.'],
  ['Espresso', 'espresso.jpg', 'Cà phê', 25000, 'Cà phê chiết xuất đậm đà với lớp crema thơm.', false],
  ['Tiramisu Latte', 'tiramisu-latte.jpg', 'Cà phê', 45000, 'Latte béo mịn với hương cacao và cảm hứng tiramisu.'],
  ['Đá Xay Oreo', 'da-xay-oreo.jpg', 'Đá xay & Matcha', 45000, 'Bánh Oreo xay cùng sữa và đá, mát lạnh, béo thơm.'],
  ['Yaourt Đá Xay', 'yaourt-da-xay.jpg', 'Đá xay & Matcha', 39000, 'Sữa chua đá xay chua dịu, mềm mịn và tươi mát.'],
  ['Trà Dâu', 'tra-dau.jpg', 'Trà trái cây', 35000, 'Trà thơm kết hợp vị dâu chua ngọt, thanh mát.'],
  ['Trà Nho', 'tra-nho.jpg', 'Trà trái cây', 35000, 'Trà thanh nhẹ kết hợp hương nho ngọt dịu.'],
  ['Trà Thanh Long', 'tra-thanh-long.jpg', 'Trà trái cây', 35000, 'Trà trái cây với thanh long tươi mát, ngọt thanh.'],
  ['Trà Sữa Dâu', 'tra-sua-dau.jpg', 'Trà sữa', 38000, 'Trà sữa béo mịn kết hợp hương dâu ngọt dịu.'],
  ['Trà Sữa Hoa Đậu Biếc', 'tra-sua-hoa-dau-biet.jpg', 'Trà sữa', 38000, 'Hoa đậu biếc kết hợp trà và sữa, vị thơm nhẹ.'],
  ['Trà Sữa Socola', 'tra-sua-socola.jpg', 'Trà sữa', 39000, 'Trà sữa hòa cùng socola đậm vị, ngọt béo vừa phải.'],
  ['Trà Sữa Truyền Thống', 'tra-sua-truyen-thong.png', 'Trà sữa', 32000, 'Vị trà thơm hòa cùng sữa béo mịn, ngọt dịu.'],
];

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('Only --apply is supported');
  for (const [, image] of catalog) {
    if (!fs.existsSync(path.resolve(__dirname, '../../web/public/images/products', image))) throw new Error(`Missing image: ${image}`);
  }
  const apply = process.argv.includes('--apply');
  const result = await db.$transaction(async (tx) => {
    if (apply) await tx.$queryRaw`SELECT pg_advisory_xact_lock(7102026, 18)::text`;
    else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const before = { products: await tx.product.count(), sizes: await tx.size.count() };
    const rows = [];
    for (const [name, image, category, price, description, multiple = true] of catalog) {
      const imageUrl = `/images/products/${image}`;
      const matches = await tx.product.findMany({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { imageUrl }] }, select: { id: true } });
      if (matches.length) { rows.push({ name, action: 'skip-existing' }); continue; }
      const group = await tx.category.findUnique({ where: { name: category } });
      if (!group || !group.isActive) throw new Error(`Category missing/inactive: ${category}`);
      const sizes = multiple ? [{ name: 'Size M', extraPrice: 0 }, { name: 'Size L', extraPrice: category === 'Đá xay & Matcha' ? 8000 : category === 'Trà sữa' ? 7000 : 6000 }] : [{ name: 'Tiêu chuẩn', extraPrice: 0 }];
      if (apply) await tx.product.create({ data: { name, description, basePrice: price, imageUrl, categoryId: group.id, stockQuantity: 0, sizes: { create: sizes.map((size) => ({ ...size, onHand: null, reserved: 0 })) } } });
      rows.push({ name, category, basePrice: price, imageUrl, sizes, action: apply ? 'created' : 'would-create' });
    }
    return { apply, before, after: { products: await tx.product.count(), sizes: await tx.size.count() }, rows };
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.code || error.errorCode || 'Catalog import failed; transaction rolled back. Check database connectivity and configuration.'); process.exitCode = 1; }).finally(() => db.$disconnect());
