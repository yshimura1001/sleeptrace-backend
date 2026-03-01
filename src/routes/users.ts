import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { userUpdateSchema } from "../schemas";
import { hashPassword } from "./auth";

type Bindings = {
  DB: D1Database;
};

type Variables = {
  jwtPayload: {
    sub: number;
    username: string;
    exp: number;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ユーザー一覧取得
app.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT id, username, is_public, created_at FROM users ORDER BY id ASC"
    ).all();
    return c.json({ data: results });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ユーザー詳細取得
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const user = await c.env.DB.prepare(
      "SELECT id, username, is_public, created_at FROM users WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ data: user });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ユーザー更新
app.put("/:id", zValidator("json", userUpdateSchema, (result, c) => {
  if (!result.success) {
    const messages = result.error.issues.map((i: { message: string }) => i.message).join(', ')
    return c.json({ error: messages }, 400)
  }
}), async (c) => {
  const id = Number(c.req.param("id"));
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  if (id !== userId) {
    return c.json({ error: "自分のアカウントのみ更新できます。" }, 403);
  }

  try {
    const body = c.req.valid("json");
    const db = c.env.DB;

    const currentUser: any = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first();

    if (!currentUser) {
      return c.json({ error: "User not found" }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];

    // ユーザー名変更
    if (body.username !== undefined && body.username !== currentUser.username) {
      const existing = await db
        .prepare("SELECT 1 FROM users WHERE username = ? AND id != ?")
        .bind(body.username, userId)
        .first();
      if (existing) {
        return c.json({ error: "ユーザー名は既に使用されています。" }, 409);
      }
      updates.push("username = ?");
      values.push(body.username);
    }

    // パスワード変更
    if (body.new_password) {
      const currentHash = await hashPassword(body.current_password!);
      if (currentHash !== currentUser.password_hash) {
        return c.json({ error: "現在のパスワードが間違っています。" }, 401);
      }
      const newHash = await hashPassword(body.new_password);
      updates.push("password_hash = ?");
      values.push(newHash);
    }

    // 公開設定変更
    if (body.is_public !== undefined) {
      updates.push("is_public = ?");
      values.push(body.is_public);
    }

    if (updates.length === 0) {
      return c.json({ message: "変更がありません。" });
    }

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
    const result = await db.prepare(sql).bind(...values).run();

    if (result.success && result.meta.changes > 0) {
      return c.json({ message: "更新しました。" });
    } else {
      return c.json({ error: "更新に失敗しました。" }, 500);
    }
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes("UNIQUE constraint failed: users.username")) {
      return c.json({ error: "ユーザー名は既に使用されています。" }, 409);
    }
    return c.json({ error: String(err) }, 500);
  }
});

// ユーザー削除
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  if (id !== userId) {
    return c.json({ error: "自分のアカウントのみ削除できます。" }, 403);
  }

  try {
    const db = c.env.DB;

    // 関連する睡眠ログを先に削除
    await db
      .prepare("DELETE FROM sleep_logs WHERE user_id = ?")
      .bind(userId)
      .run();

    // ユーザーを削除
    const result = await db
      .prepare("DELETE FROM users WHERE id = ?")
      .bind(userId)
      .run();

    if (result.success && result.meta.changes > 0) {
      return c.json({ message: "アカウントを削除しました。" });
    } else {
      return c.json({ error: "User not found" }, 404);
    }
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
