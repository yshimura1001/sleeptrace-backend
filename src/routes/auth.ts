import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>();

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string): Promise<string> {
  // ソルトを追加することで同じパスワードでも異なるハッシュを生成し、レインボーテーブル攻撃に対する耐性を向上。
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2", //計算コストを変動させることにより、ブルートフォース攻撃に対する耐性を向上。
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, hash: "SHA-256", iterations: 100_000 },
    keyMaterial,
    256
  );
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(hashBuffer)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, hash: "SHA-256", iterations: 100_000 },
    keyMaterial,
    256
  );
  return toHex(hashBuffer) === hashHex;
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

    // ユーザーが既に登録されていないか確認。
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

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: "ユーザー名またはパスワードが間違っています。" }, 401);
    }

    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7日間。
    };

    const secret = c.env.JWT_SECRET;
    const token = await sign(payload, secret);

    return c.json({ token, user: { id: user.id, username: user.username } });
  }
);

// 当該ユーザーが公開設定をONにしているか確認するヘルパー関数。
export async function resolveViewUserId(c: any, requesterId: number): Promise<number> {
  const targetIdStr = c.req.query("targetUserId");
  if (targetIdStr) {
    const targetId = Number(targetIdStr);
    // 自分のデータを見ようとしている場合は、そのままユーザーIDを返す
    if (targetId === requesterId) return requesterId;

    // 公開設定をONにしているかのチェック
    const user: any = await c.env.DB.prepare("SELECT is_public FROM users WHERE id = ?").bind(targetId).first();
    if (!user || user.is_public !== 1) {
       throw new Error("Access denied: User data is not public");
    }
    return targetId;
  }
  return requesterId;
}

export default app;
