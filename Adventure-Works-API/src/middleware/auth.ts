import { Request, Response, NextFunction } from "express";
import { firebaseAdmin } from "../firebaseAdmin.js";

export interface AuthRequest extends Request {
  user?: { uid: string; email?: string | null };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization;
    if (!hdr?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }
    const idToken = hdr.substring("Bearer ".length);
    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
    next();
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Invalid token" });
  }
}
