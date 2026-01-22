import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// ダッシュボード用: 全体統計データ取得
app.get("/statistics", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `
      SELECT 
        MIN(sleep_score) as min_score,
        MAX(sleep_score) as max_score,
        AVG(sleep_score) as avg_score,
        MIN(sleep_duration) as min_duration,
        MAX(sleep_duration) as max_duration,
        AVG(sleep_duration) as avg_duration,
        MIN(wakeup_count) as min_wakeup_count,
        MAX(wakeup_count) as max_wakeup_count,
        AVG(wakeup_count) as avg_wakeup_count,
        MIN(deep_sleep_continuity) as min_deep_sleep_continuity,
        MAX(deep_sleep_continuity) as max_deep_sleep_continuity,
        AVG(deep_sleep_continuity) as avg_deep_sleep_continuity,
        MIN(deep_sleep_percentage) as min_deep_sleep_percentage,
        MAX(deep_sleep_percentage) as max_deep_sleep_percentage,
        AVG(deep_sleep_percentage) as avg_deep_sleep_percentage,
        MIN(light_sleep_percentage) as min_light_sleep_percentage,
        MAX(light_sleep_percentage) as max_light_sleep_percentage,
        AVG(light_sleep_percentage) as avg_light_sleep_percentage,
        MIN(rem_sleep_percentage) as min_rem_sleep_percentage,
        MAX(rem_sleep_percentage) as max_rem_sleep_percentage,
        AVG(rem_sleep_percentage) as avg_rem_sleep_percentage,
        COUNT(*) as count
      FROM sleep_logs
    `,
    ).first();

    if (!result || result.count === 0) {
      return c.json({ data: null });
    }

    // 時間のAVG計算（簡易）: 分換算して平均を取り、HH:MMに戻す
    const timeStats = await c.env.DB.prepare(
      `
      SELECT 
        AVG(
          CASE 
            WHEN CAST(substr(bed_time, 1, 2) AS INTEGER) < 15 
            THEN (CAST(substr(bed_time, 1, 2) AS INTEGER) + 24) * 60 + CAST(substr(bed_time, 4, 2) AS INTEGER)
            ELSE CAST(substr(bed_time, 1, 2) AS INTEGER) * 60 + CAST(substr(bed_time, 4, 2) AS INTEGER)
          END
        ) as avg_bed_time_min,
        AVG(
          CAST(substr(wakeup_time, 1, 2) AS INTEGER) * 60 + CAST(substr(wakeup_time, 4, 2) AS INTEGER)
        ) as avg_wakeup_time_min
      FROM sleep_logs
      `,
    ).first();

    // トレンド分析用: 全データの必要カラムを取得 (日付昇順)
    const rawData = await c.env.DB.prepare(
      `
      SELECT 
        wakeup_count,
        deep_sleep_continuity,
        deep_sleep_percentage,
        light_sleep_percentage
      FROM sleep_logs
      ORDER BY sleep_date ASC
      `
    ).all<{
      wakeup_count: number;
      deep_sleep_continuity: number;
      deep_sleep_percentage: number;
      light_sleep_percentage: number;
    }>();

    const calculateSlope = (data: number[]) => {
      const n = data.length;
      if (n < 2) return 0;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = data;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      return slope;
    };

    const trends = {
      wakeup_count: calculateSlope(rawData.results.map((d) => d.wakeup_count)),
      deep_sleep_continuity: calculateSlope(
        rawData.results.map((d) => d.deep_sleep_continuity),
      ),
      deep_sleep_percentage: calculateSlope(
        rawData.results.map((d) => d.deep_sleep_percentage),
      ),
      light_sleep_percentage: calculateSlope(
        rawData.results.map((d) => d.light_sleep_percentage),
      ),
    };

    return c.json({
      data: {
        ...result,
        ...timeStats,
        trends,
      },
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ダッシュボード用: 曜日別データ取得
app.get("/weekly", async (c) => {
  try {
    // 曜日ごと (0=Sun, 1=Mon, ..., 6=Sat) の平均を計算
    const results = await c.env.DB.prepare(
      `
      SELECT 
        strftime('%w', sleep_date) as day_of_week,
        AVG(sleep_score) as avg_score,
        AVG(sleep_duration) as avg_duration,
        AVG(wakeup_count) as avg_wakeup_count,
        AVG(deep_sleep_continuity) as avg_deep_sleep_continuity,
        AVG(deep_sleep_percentage) as avg_deep_sleep_percentage,
        AVG(light_sleep_percentage) as avg_light_sleep_percentage,
        AVG(rem_sleep_percentage) as avg_rem_sleep_percentage,
        AVG(
          CASE 
            WHEN CAST(substr(bed_time, 1, 2) AS INTEGER) < 15 
            THEN (CAST(substr(bed_time, 1, 2) AS INTEGER) + 24) * 60 + CAST(substr(bed_time, 4, 2) AS INTEGER)
            ELSE CAST(substr(bed_time, 1, 2) AS INTEGER) * 60 + CAST(substr(bed_time, 4, 2) AS INTEGER)
          END
        ) as avg_bed_time_min,
        AVG(
          CAST(substr(wakeup_time, 1, 2) AS INTEGER) * 60 + CAST(substr(wakeup_time, 4, 2) AS INTEGER)
        ) as avg_wakeup_time_min,
        COUNT(*) as count
      FROM sleep_logs
      GROUP BY day_of_week
      ORDER BY day_of_week ASC
    `,
    ).all();

    return c.json({
      data: results.results,
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
