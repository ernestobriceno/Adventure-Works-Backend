import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();

const CheckoutBody = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      qty: z.number().int().min(1),
    })
  ),
  // opcionalmente userId si quieres asociar orden
  userId: z.string().optional(),
});

router.post("/fake", async (req, res) => {
  const parsed = CheckoutBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { items, userId } = parsed.data;

  // obtener productos y calcular subtotal
  const products = await prisma.product.findMany({
    where: { id: { in: items.map(i => i.productId) } },
  });

  const mapped = items.map(i => {
    const p = products.find(pp => pp.id === i.productId);
    if (!p) throw new Error(`Product not found: ${i.productId}`);
    return {
      productId: p.id,
      name: p.name,
      price: Number(p.price),
      image: p.image,
      qty: i.qty,
    };
  });

  const subtotal = mapped.reduce((acc, it) => acc + it.qty * it.price, 0);

  // Simular “gateway” de pago con un delay
  await new Promise((r) => setTimeout(r, 1500));

  // Crear orden (paid = true)
  const order = await prisma.order.create({
    data: {
      userId: userId ?? "guest", // puedes guardar “guest” o crear usuario si tienes auth
      subtotal,
      items: { createMany: { data: mapped } },
    },
    include: {
