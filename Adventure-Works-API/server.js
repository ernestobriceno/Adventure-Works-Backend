// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { OAuth2Client } from "google-auth-library";
import { products, categories } from "./data/products.js";

// ---------- ENV / CONFIG ----------
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_PATH = path.join(__dirname, "data", "users.json");
const ORDERS_PATH = path.join(__dirname, "data", "orders.json");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""; // opcional, recomendado setearlo

// Permite front en local y otros dominios que agregues por coma
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---------- APP ----------
const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",                 // front local (Vite)
      "http://127.0.0.1:5173",
      "https://adventureworkscycle.netlify.app" // tu sitio en Netlify
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- HELPERS (persistencia JSON) ----------
function readJSON(p) {
  try {
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}
function writeJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ---------- AUTH MIDDLEWARE ----------
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- UTILS ----------
function unitPrice(p) {
  // -25% si es deal
  return p.tag === "deal" ? +(p.price * 0.75).toFixed(2) : p.price;
}

// ---------- GOOGLE OAUTH ----------
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ================== ROUTES ==================

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// -------- Productos
// GET /api/products?category=...&tag=deal&q=texto
app.get("/api/products", (req, res) => {
  let list = [...products];
  const { category, tag, q } = req.query;

  if (category) list = list.filter((p) => p.category === category);
  if (tag) list = list.filter((p) => p.tag === tag);
  if (q) {
    const t = String(q).toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(t) ||
        p.brand.toLowerCase().includes(t)
    );
  }
  res.json(list);
});

// GET /api/products/:id
app.get("/api/products/:id", (req, res) => {
  const p = products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// GET /api/categories
app.get("/api/categories", (_req, res) => res.json(categories));

// GET /api/deals (solo tag=deal)
app.get("/api/deals", (_req, res) =>
  res.json(products.filter((p) => p.tag === "deal"))
);

// -------- Auth (email/password)
// POST /api/auth/signup  {email, password, name}
app.post("/api/auth/signup", (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing fields" });

  const users = readJSON(USERS_PATH);
  if (users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: nanoid(),
    email,
    name: name || "",
    hash,
    createdAt: Date.now(),
  };
  users.push(user);
  writeJSON(USERS_PATH, users);

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// POST /api/auth/signin  {email, password}
app.post("/api/auth/signin", (req, res) => {
  const { email, password } = req.body || {};
  const users = readJSON(USERS_PATH);
  const user = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );
  if (!user || !user.hash)
    return res.status(401).json({ error: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// -------- Auth (Google)
// POST /api/auth/google  { idToken }
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    // Verificar el ID Token con Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID || undefined, // mejor setearlo en .env
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ error: "Invalid Google token" });

    const email = payload.email;
    const name = payload.name || "";
    if (!email) return res.status(400).json({ error: "Google token missing email" });

    // Buscar o crear usuario
    const users = readJSON(USERS_PATH);
    let user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      user = {
        id: nanoid(),
        email,
        name,
        provider: "google",
        createdAt: Date.now(),
      };
      users.push(user);
      writeJSON(USERS_PATH, users);
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider || "google",
      },
    });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Google verification failed" });
  }
});

// GET /api/me
app.get("/api/me", auth, (req, res) => {
  const users = readJSON(USERS_PATH);
  const me = users.find((u) => u.id === req.user.sub);
  if (!me) return res.status(404).json({ error: "Not found" });
  res.json({ id: me.id, email: me.email, name: me.name });
});

// -------- Órdenes
// POST /api/orders  {items:[{productId,qty}], address, discount?, shipping?}
app.post("/api/orders", auth, (req, res) => {
  try {
    const { items, address, discount, shipping = 0 } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart items required" });
    }

    // Enriquecer líneas
    const lines = items.map((it) => {
      const p = products.find((x) => x.id === it.productId);
      if (!p) throw new Error("Invalid product");
      const unit = unitPrice(p);
      const qty = Number(it.qty || 1);
      return {
        productId: p.id,
        name: p.name,
        brand: p.brand,
        image: p.image,
        tag: p.tag || null,
        qty,
        unit,
        line: +(unit * qty).toFixed(2),
      };
    });

    // Total
    let total = +lines.reduce((a, b) => a + b.line, 0).toFixed(2);
    const discountAmount = discount?.amount ? Number(discount.amount) : 0;
    total = +(total - discountAmount + Number(shipping)).toFixed(2);
    if (total < 0) total = 0;

    // Persistir
    const orders = readJSON(ORDERS_PATH);
    const order = {
      id: nanoid(),
      userId: req.user.sub,
      items: lines,
      total,
      address: address || null,
      discount: discount || null,
      shipping: Number(shipping) || 0,
      status: "created",
      createdAt: Date.now(),
    };
    orders.push(order);
    writeJSON(ORDERS_PATH, orders);

    res.status(201).json(order);
  } catch (e) {
    res.status(400).json({ error: e.message || "Invalid payload" });
  }
});

// GET /api/orders/:id
app.get("/api/orders/:id", auth, (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find((o) => o.id === req.params.id && o.userId === req.user.sub);
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

// GET /api/orders/:id/invoice.pdf  -> Genera PDF
app.get("/api/orders/:id/invoice.pdf", auth, (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find((o) => o.id === req.params.id && o.userId === req.user.sub);
  if (!order) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="Factura-${order.id}.pdf"`
  );

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.pipe(res);

  // Encabezado
  doc.fontSize(18).text("AdventureWorks - Factura", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#666").text(`Orden: ${order.id}`);
  doc.text(`Fecha: ${new Date(order.createdAt).toLocaleString()}`);
  if (order.address?.name) doc.text(`Cliente: ${order.address.name}`);
  doc.moveDown(1);
  doc.fillColor("#000");

  // Items
  doc.fontSize(12).text("Items", { underline: true });
  doc.moveDown(0.5);
  order.items.forEach((it) => {
    doc.fontSize(11).text(`${it.name} (${it.brand}) x${it.qty}`);
    let extra = `Unit: $${it.unit.toFixed(2)}   Linea: $${it.line.toFixed(2)}`;
    if (it.tag === "deal") extra += "   (-25%)";
    doc.fontSize(10).fillColor("#666").text(extra);
    doc.fillColor("#000").moveDown(0.5);
  });

  // Totales
  doc.moveDown(1);
  if (order.discount?.amount) {
    doc
      .fontSize(11)
      .text(
        `Descuento (${order.discount.code}): -$${Number(
          order.discount.amount
        ).toFixed(2)}`,
        { align: "right" }
      );
  }
  if (order.shipping) {
    doc
      .fontSize(11)
      .text(`Envío: $${Number(order.shipping).toFixed(2)}`, { align: "right" });
  }
  doc.fontSize(13).text(`Total: $${order.total.toFixed(2)}`, { align: "right" });

  doc.end();
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
