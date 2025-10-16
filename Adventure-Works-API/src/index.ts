import "dotenv/config";
import express from "express";
import cors from "cors";
import { productsRouter } from "./routes/products.js";
import { ordersRouter } from "./routes/orders.js";
import checkoutRouter from "./routes/checkout.js";

app.use("/api/checkout", checkoutRouter);


const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Rutas
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
