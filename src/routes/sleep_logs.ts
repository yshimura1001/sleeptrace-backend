import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// 睡眠ログのバリデーションスキーマ
import { sleepLogSchema } from "../schemas";

// 睡眠データの保存 API
// zValidator でリクエストボディのバリデーションを行います
app.post("/", zValidator("json", sleepLogSchema), async (c) => {
  try {
    // バリデーション済みのデータを取得
    const body = c.req.valid("json");

    // 同一日付のデータが存在するか確認
    const existing = await c.env.DB.prepare(
      "SELECT id FROM sleep_logs WHERE sleep_date = ?",
    )
      .bind(body.sleep_date)
      .first();

    if (existing) {
      return c.json({ error: "指定された日付のデータは既に存在します。" }, 409);
    }

    // D1 への保存クエリを実行
    const result = await c.env.DB.prepare(
      `
      INSERT INTO sleep_logs (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
// 睡眠データの取得 (月単位 or ページネーション)
app.get("/", async (c) => {
  try {
    const month = c.req.query("month"); // YYYY-MM
    let results;

    if (month) {
      // 月指定がある場合: その月のデータを全件取得
      // 日付の降順
      const { results: data } = await c.env.DB.prepare(
        `
        SELECT * FROM sleep_logs 
        WHERE strftime('%Y-%m', sleep_date) = ? 
        ORDER BY sleep_date ASC
      `,
      )
        .bind(month)
        .all();
      results = data;

      // month指定時はページネーション情報は簡易的なものまたはnullで返す
      return c.json({
        data: results,
        meta: {
          month,
          total: results.length,
        },
      });
    } else {
      // 従来のページネーションロジック (後方互換性のため残す、あるいはデフォルト動作)
      const page = Number(c.req.query("page") || 1);
      const limit = Number(c.req.query("limit") || 50);
      const offset = (page - 1) * limit;

      const { results: data } = await c.env.DB.prepare(
        `
        SELECT * FROM sleep_logs ORDER BY sleep_date DESC LIMIT ? OFFSET ?
      `,
      )
        .bind(limit, offset)
        .all();
      results = data;

      // 総件数の取得
      const totalCountResult = await c.env.DB.prepare(
        `
        SELECT COUNT(*) as count FROM sleep_logs
      `,
      ).first<{ count: number }>();

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
  try {
    const log = await c.env.DB.prepare(
      `
      SELECT * FROM sleep_logs WHERE id = ?
    `,
    )
      .bind(id)
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
  try {
    const body = c.req.valid("json");

    // 同一日付のデータが他に存在するか確認 (自分自身は除く)
    const existing = await c.env.DB.prepare(
      "SELECT id FROM sleep_logs WHERE sleep_date = ? AND id != ?",
    )
      .bind(body.sleep_date, id)
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
      WHERE id = ?
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
  try {
    const result = await c.env.DB.prepare("DELETE FROM sleep_logs WHERE id = ?")
      .bind(id)
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
