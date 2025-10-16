import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const prisma = new PrismaClient();
export const ordersRouter = Router();

const OrderItem = z.object({
  productId: z.string(),
  qty: z.number().int().min(1),
});

const CreateOrder = z.object({
  items: z.array(OrderItem).min(1)
});

// GET /api/orders/me – mis órdenes
ordersRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const uid = req.user!.uid;
  // asegurar usuario en tabla Users (si usas Firestore para user profiles, puedes sincronizar aquí)
  let user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) user = await prisma.user.create({ data: { id: uid, email: req.user!.email ?? "unknown@user" } });

  const orders = await prisma.order.findMany({
    where: { userId: uid },
    include: { items: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(orders);
});

// POST /api/orders – crear orden
ordersRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateOrder.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const uid = req.user!.uid;
  let user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) user = await prisma.user.create({ data: { id: uid, email: req.user!.email ?? "unknown@user" } });

  const productIds = parsed.data.items.map(i => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

  // mapear items + calcular subtotal
  const items = parsed.data.items.map(i => {
    const p = products.find(pp => pp.id === i.productId);
    if (!p) throw new Error(`Product not found: ${i.productId}`);
    return {
      productId: p.id,
      name: p.name,
      price: Number(p.price),
      image: p.image,
      qty: i.qty
    };
  });

  const subtotal = items.reduce((acc, it) => acc + it.qty * it.price, 0);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      subtotal,
      items: { createMany: { data: items } }
    },
    include: { items: true }
  });

  res.status(201).json(order);
});
