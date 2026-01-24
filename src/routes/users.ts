import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

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

export default app;
