import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const prisma = new PrismaClient();
export const productsRouter = Router();

/** GET /api/products – listar productos */
productsRouter.get("/", async (_req, res) => {
  const list = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list);
});

/** GET /api/products/:id – detalle */
productsRouter.get("/:id", async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// (Opcional) Crear/editar/borrar productos – proteger con auth.
// Puedes restringir a admin por email o claims personalizados si quieres.

const ProductBody = z.object({
  name: z.string().min(2),
  brand: z.string().min(1),
  price: z.number().positive(),
  image: z.string().url(),
  tag: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  stockTag: z.string().optional()
});

/** POST /api/products */
productsRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  // ejemplo de simple gate admin (ajusta a lo que necesites)
  if (!req.user?.email?.endsWith("@yourcompany.com")) return res.status(403).json({ error: "Forbidden" });

  const parsed = ProductBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await prisma.product.create({ data: parsed.data });
  res.status(201).json(created);
});

/** PUT /api/products/:id */
productsRouter.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.email?.endsWith("@yourcompany.com")) return res.status(403).json({ error: "Forbidden" });

  const parsed = ProductBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

/** DELETE /api/products/:id */
productsRouter.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.email?.endsWith("@yourcompany.com")) return res.status(403).json({ error: "Forbidden" });
  await prisma.product.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
