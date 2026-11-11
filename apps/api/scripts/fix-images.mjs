import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const updates = [
  { like: '%Affogato%',     url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=640' },
  { like: '%Americano%',    url: 'https://images.unsplash.com/photo-1521302080334-4bebac2763a6?w=640' },
  { like: '%Bạc Xỉu%',     url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=640' },
  { like: '%Cold Brew%',    url: 'https://images.unsplash.com/photo-1517959105821-eaf2591984d2?w=640' },
  { like: '%Cà Phê Muối%', url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=640' },
  { like: '%Cà Phê Trứng%',url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=640' },
  { like: '%Cà phê%',      url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=640' },
  { like: '%Cappuccino%',   url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=640' },
  { like: '%Espresso%',     url: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=640' },
  { like: '%Latte%',        url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=640' },
  { like: '%Mocha%',        url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=640' },
  { like: '%Matcha%',       url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=640' },
  { like: '%Trà Đào%',     url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=640' },
  { like: '%Trà Vải%',     url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=640' },
  { like: '%Trà Sữa%',     url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640' },
  { like: '%Trà Nho%',     url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=640' },
  { like: '%Dừa%',         url: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=640' },
  { like: '%Dâu%',         url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=640' },
  { like: '%Chanh%',       url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=640' },
  { like: '%Bánh%',        url: 'https://images.unsplash.com/photo-1612203985729-70726954388c?w=640' },
];

async function main() {
  for (const { like, url } of updates) {
    const result = await prisma.product.updateMany({
      where: { name: { contains: like.replace(/%/g, ''), mode: 'insensitive' } },
      data: { imageUrl: url },
    });
    if (result.count > 0) {
      console.log(`✅ ${like.replace(/%/g,'')} → ${result.count} sản phẩm đã cập nhật`);
    }
  }
  console.log('\n🎉 Xong! Tải lại trang web để xem ảnh mới.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
