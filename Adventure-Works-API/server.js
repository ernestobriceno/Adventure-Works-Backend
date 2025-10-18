import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { products, categories } from "./data/products.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_PATH = path.join(__dirname, "data", "users.json");
const ORDERS_PATH = path.join(__dirname, "data", "orders.json");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const app = express();

// CORS para Vite (5173) – ajusta si usas otro puerto
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(express.json());

// Helpers persistencia simple en JSON
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

// Auth middleware
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

// Utils
function unitPrice(p) {
  // -25% si es deal
  return p.tag === "deal" ? +(p.price * 0.75).toFixed(2) : p.price;
}

// ========= RUTAS =========

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Productos
app.get("/api/products", (req, res) => {
  // filtros: ?category=... &tag=deal &q=texto
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

app.get("/api/products/:id", (req, res) => {
  const p = products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

app.get("/api/categories", (_req, res) => res.json(categories));
app.get("/api/deals", (_req, res) =>
  res.json(products.filter((p) => p.tag === "deal"))
);

// Auth
app.post("/api/auth/signup", (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = readJSON(USERS_PATH);
  if (users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: "Email already registered" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = { id: nanoid(), email, name: name || "", hash, createdAt: Date.now() };
  users.push(user);
  writeJSON(USERS_PATH, users);

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/auth/signin", (req, res) => {
  const { email, password } = req.body || {};
  const users = readJSON(USERS_PATH);
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get("/api/me", auth, (req, res) => {
  const users = readJSON(USERS_PATH);
  const me = users.find((u) => u.id === req.user.sub);
  if (!me) return res.status(404).json({ error: "Not found" });
  res.json({ id: me.id, email: me.email, name: me.name });
});

// Órdenes (crear con items del carrito)
app.post("/api/orders", auth, (req, res) => {
  const { items, address } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart items required" });
  }
  // Validar y calcular total
  const enriched = items.map((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (!p) throw new Error("Invalid product");
    const unit = unitPrice(p);
    return {
      productId: p.id,
      name: p.name,
      brand: p.brand,
      image: p.image,
      tag: p.tag || null,
      qty: Number(it.qty || 1),
      unit,
      line: +(unit * Number(it.qty || 1)).toFixed(2),
    };
  });

  const total = +enriched.reduce((a, b) => a + b.line, 0).toFixed(2);

  const orders = readJSON(ORDERS_PATH);
  const order = {
    id: nanoid(),
    userId: req.user.sub,
    items: enriched,
    total,
    address: address || null,
    status: "created",
    createdAt: Date.now(),
  };
  orders.push(order);
  writeJSON(ORDERS_PATH, orders);

  res.status(201).json(order);
});

app.get("/api/orders/:id", auth, (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find((o) => o.id === req.params.id && o.userId === req.user.sub);
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

// Arrancar
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
