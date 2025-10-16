import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.product.count();
  if (count > 0) {
    console.log("Products already seeded.");
    return;
  }

  await prisma.product.createMany({
    data: [
      { name: "Merida", brand: "MERIDA", price: 600.5, image: "https://images.unsplash.com/photo-1518659526055-c9c1a23309ff?q=80&w=1200&auto=format&fit=crop", tag: "new", rating: 5, stockTag: "low" },
      { name: "Trek", brand: "TREK", price: 600.5, image: "https://images.unsplash.com/photo-1498654200943-1088dd4438ae?q=80&w=1200&auto=format&fit=crop", rating: 5 },
      { name: "Haro", brand: "HARO", price: 1050, image: "https://images.unsplash.com/photo-1517167685280-595076a44a5d?q=80&w=1200&auto=format&fit=crop", rating: 5 },
      { name: "Santa Cruz", brand: "SANTA CRUZ", price: 2550.5, image: "https://images.unsplash.com/photo-1520992428834-ce58b4c2d2b2?q=80&w=1200&auto=format&fit=crop", rating: 5, stockTag: "low" }
    ]
  });

  console.log("Seed OK");
}

main().finally(async () => prisma.$disconnect());
