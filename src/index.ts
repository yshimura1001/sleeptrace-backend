import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

import authRouter from "./routes/auth";
import csvRouter from "./routes/csv";
import dashboardRouter from "./routes/dashboard";
import sleepLogsRouter from "./routes/sleep_logs";
import usersRouter from "./routes/users";

const app = new Hono<{ Bindings: Bindings }>();

// CORSを許可する
app.use("/api/*", cors());

// Authentication Routes (Public)
app.route("/api/auth", authRouter);

// JWT Middleware for protected routes
app.use("/api/sleep_logs/*", (c, next) => {
    const secret = c.env.JWT_SECRET || "fallback_secret_for_dev";
    const jwtMiddleware = jwt({ secret });
    return jwtMiddleware(c, next);
});
app.use("/api/dashboard/*", (c, next) => {
    const secret = c.env.JWT_SECRET || "fallback_secret_for_dev";
    const jwtMiddleware = jwt({ secret });
    return jwtMiddleware(c, next);
});
app.use("/api/csv/*", (c, next) => {
    const secret = c.env.JWT_SECRET || "fallback_secret_for_dev";
    const jwtMiddleware = jwt({ secret });
    return jwtMiddleware(c, next);
});
app.use("/api/users/*", (c, next) => {
    const secret = c.env.JWT_SECRET || "fallback_secret_for_dev";
    const jwtMiddleware = jwt({ secret });
    return jwtMiddleware(c, next);
});


// Protected Routes
app.route("/api/dashboard", dashboardRouter);
app.route("/api/sleep_logs", sleepLogsRouter);
app.route("/api/csv", csvRouter);
app.route("/api/users", usersRouter);

// 疎通確認用エンドポイント (Public)
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
