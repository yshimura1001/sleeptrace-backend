import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>();

// Simple SHA-256 hash function (In production, use salt + PBKDF2 or similar)
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const authSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

app.post(
  "/signup",
  zValidator("json", authSchema),
  async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.env.DB;

    // Check existing
    const existing = await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
    if (existing) {
      return c.json({ error: "ユーザー名は既に使用されています。" }, 409);
    }

    const passwordHash = await hashPassword(password);

    const res = await db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").bind(username, passwordHash).run();

    if (!res.success) {
      return c.json({ error: "ユーザー登録に失敗しました。" }, 500);
    }

    return c.json({ message: "登録完了" }, 201);
  }
);

app.post(
  "/login",
  zValidator("json", authSchema),
  async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.env.DB;

    const user: any = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!user) {
      return c.json({ error: "ユーザー名またはパスワードが間違っています。" }, 401);
    }

    const inputHash = await hashPassword(password);
    if (inputHash !== user.password_hash) {
      return c.json({ error: "ユーザー名またはパスワードが間違っています。" }, 401);
    }

    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    };

    const secret = c.env.JWT_SECRET || "fallback_secret_for_dev"; // Should be env var
    const token = await sign(payload, secret);

    return c.json({ token, user: { id: user.id, username: user.username } });
  }
);

export default app;
