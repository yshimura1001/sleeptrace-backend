import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = {
  DB: D1Database;
};

// Define variables for Context
type Variables = {
  jwtPayload: {
    sub: number;
    username: string;
    exp: number;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 睡眠ログのバリデーションスキーマ
import { sleepLogSchema } from "../schemas";

// 睡眠データの保存 API
app.post("/", zValidator("json", sleepLogSchema), async (c) => {
  try {
    const body = c.req.valid("json");
    const payload = c.get("jwtPayload");
    const userId = payload.sub;

    // 同一日付のデータが存在するか確認 (ユーザー単位)
    const existing = await c.env.DB.prepare(
      "SELECT id FROM sleep_logs WHERE sleep_date = ? AND user_id = ?",
    )
      .bind(body.sleep_date, userId)
      .first();

    if (existing) {
      return c.json({ error: "指定された日付のデータは既に存在します。" }, 409);
    }

    // D1 への保存クエリを実行
    const result = await c.env.DB.prepare(
      `
      INSERT INTO sleep_logs (
        user_id,
        sleep_date, 
        sleep_score, 
        bed_time, 
        wakeup_time, 
        sleep_duration, 
        wakeup_count, 
        deep_sleep_continuity, 
        deep_sleep_percentage, 
        light_sleep_percentage, 
        rem_sleep_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(
        userId,
        body.sleep_date,
        body.sleep_score,
        body.bed_time,
        body.wakeup_time,
        body.sleep_duration,
        body.wakeup_count,
        body.deep_sleep_continuity,
        body.deep_sleep_percentage,
        body.light_sleep_percentage,
        body.rem_sleep_percentage,
      )
      .run();

    if (result.success) {
      return c.json({ message: "Success!", id: result.meta.last_row_id }, 201);
    } else {
      return c.json({ error: "Database insert failed" }, 500);
    }
  } catch (err) {
    console.error(err);
    return c.json({ error: "Server Error" }, 500);
  }
});
// Helper to resolve user ID for viewing
async function resolveViewUserId(c: any, requesterId: number): Promise<number> {
  const targetIdStr = c.req.query("targetUserId");
  if (targetIdStr) {
    const targetId = Number(targetIdStr);
    // If viewing self, no extra check needed
    if (targetId === requesterId) return requesterId;

    // Check if target is public
    const user: any = await c.env.DB.prepare("SELECT is_public FROM users WHERE id = ?").bind(targetId).first();
    if (!user || user.is_public !== 1) {
       throw new Error("Access denied: User data is not public");
    }
    return targetId;
  }
  return requesterId;
}

// 睡眠データの取得 (月単位 or ページネーション)
app.get("/", async (c) => {
  try {
    const payload = c.get("jwtPayload");
    const requesterId = payload.sub;
    let userId = requesterId;

    try {
        userId = await resolveViewUserId(c, requesterId);
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "Forbidden" }, 403);
    }

    const month = c.req.query("month"); // YYYY-MM
    let results;

    if (month) {
      const { results: data } = await c.env.DB.prepare(
        `
        SELECT * FROM sleep_logs 
        WHERE strftime('%Y-%m', sleep_date) = ? AND user_id = ?
        ORDER BY sleep_date ASC
      `,
      )
        .bind(month, userId)
        .all();
      results = data;

      return c.json({
        data: results,
        meta: {
          month,
          total: results.length,
        },
      });
    } else {
      const page = Number(c.req.query("page") || 1);
      const limit = Number(c.req.query("limit") || 50);
      const offset = (page - 1) * limit;

      const { results: data } = await c.env.DB.prepare(
        `
        SELECT * FROM sleep_logs WHERE user_id = ? ORDER BY sleep_date DESC LIMIT ? OFFSET ?
      `,
      )
        .bind(userId, limit, offset)
        .all();
      results = data;

      const totalCountResult = await c.env.DB.prepare(
        `
        SELECT COUNT(*) as count FROM sleep_logs WHERE user_id = ?
      `,
      ).bind(userId).first<{ count: number }>();

      const total = totalCountResult?.count || 0;

      return c.json({
        data: results,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// 単一の睡眠ログ取得
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const payload = c.get("jwtPayload");
  const requesterId = payload.sub;
  let userId = requesterId;

  try {
      userId = await resolveViewUserId(c, requesterId);
  } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Forbidden" }, 403);
  }

  try {
    const log = await c.env.DB.prepare(
      `
      SELECT * FROM sleep_logs WHERE id = ? AND user_id = ?
    `,
    )
      .bind(id, userId)
      .first();

    if (!log) {
      return c.json({ error: "Sleep log not found" }, 404);
    }
    return c.json(log);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// 睡眠ログの更新
app.put("/:id", zValidator("json", sleepLogSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  try {
    const body = c.req.valid("json");

    // Check ownership and duplicates
    const existing = await c.env.DB.prepare(
      "SELECT id FROM sleep_logs WHERE sleep_date = ? AND user_id = ? AND id != ?",
    )
      .bind(body.sleep_date, userId, id)
      .first();

    if (existing) {
      return c.json({ error: "指定された日付のデータは既に存在します。" }, 409);
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE sleep_logs SET
        sleep_date = ?,
        sleep_score = ?,
        bed_time = ?,
        wakeup_time = ?,
        sleep_duration = ?,
        wakeup_count = ?,
        deep_sleep_continuity = ?,
        deep_sleep_percentage = ?,
        light_sleep_percentage = ?,
        rem_sleep_percentage = ?
      WHERE id = ? AND user_id = ?
    `,
    )
      .bind(
        body.sleep_date,
        body.sleep_score,
        body.bed_time,
        body.wakeup_time,
        body.sleep_duration,
        body.wakeup_count,
        body.deep_sleep_continuity,
        body.deep_sleep_percentage,
        body.light_sleep_percentage,
        body.rem_sleep_percentage,
        id,
        userId
      )
      .run();

    if (result.success) {
      if (result.meta.changes > 0) {
        return c.json({ message: "Updated successfully" });
      } else {
        return c.json({ error: "Sleep log not found or no changes made" }, 404);
      }
    } else {
      return c.json({ error: "Database update failed" }, 500);
    }
  } catch (err) {
    console.error(err);
    return c.json({ error: "Server Error" }, 500);
  }
});

// 睡眠ログの削除
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const payload = c.get("jwtPayload");
  const userId = payload.sub;

  try {
    const result = await c.env.DB.prepare("DELETE FROM sleep_logs WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();

    if (result.success) {
      if (result.meta.changes > 0) {
        return c.json({ message: "Deleted successfully" });
      } else {
        return c.json({ error: "Sleep log not found" }, 404);
      }
    } else {
      return c.json({ error: "Database delete failed" }, 500);
    }
  } catch (err) {
    console.error(err);
    return c.json({ error: "Server Error" }, 500);
  }
});

export default app;
