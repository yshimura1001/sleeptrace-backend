import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

import dashboardRouter from "./routes/dashboard";
import sleepLogsRouter from "./routes/sleep_logs";

const app = new Hono<{ Bindings: Bindings }>();

// CORSを許可する(フロントエンドからのアクセスを許可する)
app.use("/api/*", cors());

// ダッシュボード関連のルートをマウント
app.route("/api/dashboard", dashboardRouter);

// 睡眠ログ関連のルートをマウント
app.route("/api/sleep_logs", sleepLogsRouter);

// 疎通確認用エンドポイント
app.get("api/check", async (c) => {
  try {
    const db = c.env.DB;
    const res = await db
      .prepare("SELECT 1 as result")
      .all<{ result: number }>();
    const result = res.results?.[0]?.result || 0;
    return c.json({
      status: "success",
      message: "Database connected successfully!",
      result,
    });
  } catch (e) {
    return c.json(
      {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});

export default app;
