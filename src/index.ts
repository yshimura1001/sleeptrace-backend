import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

// 睡眠ログのバリデーションスキーマ
const sleepLogSchema = z.object({
  sleep_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 
    "日付は YYYY-MM-DD 形式で入力してください。"),
  sleep_score: z.number().min(0).max(100, 
    "スコアは 0 から 100 の間で入力してください。"),
  bed_time: z.string().regex(/^\d{2}:\d{2}$/, 
    "就寝時間は HH:MM 形式で入力してください。"),
  wakeup_time: z.string().regex(/^\d{2}:\d{2}$/, 
    "起床時間は HH:MM 形式で入力してください。"),
  sleep_duration: z.number().int().
  positive("睡眠時間は正の整数（分）で入力してください。"),
  wakeup_count: z.number().int().min(0, 
    "中途覚醒回数は 0 以上の整数で入力してください。"),
  deep_sleep_continuity: z.number().min(0).max(100, 
    "深い睡眠の持続性は 0 から 100 の間で入力してください。"),
  deep_sleep_percentage: z.number().min(0).max(100, 
    "深い睡眠の割合は 0 から 100 の間で入力してください。"),
  light_sleep_percentage: z.number().min(0).max(100, 
    "浅い睡眠の割合は 0 から 100 の間で入力してください。"),
  rem_sleep_percentage: z.number().min(0).max(100, 
    "レム睡眠の割合は 0 から 100 の間で入力してください。"),
}).refine((data) => {
  const sum = data.deep_sleep_percentage + data.light_sleep_percentage + data.rem_sleep_percentage;
  return sum === 100;
}, {
  message: "深い睡眠割合、浅い睡眠割合、レム睡眠割合の合計は100%である必要があります。",
  path: ["deep_sleep_percentage"], // エラーを deep_sleep_percentage に紐付ける（あるいは root でも可）
});

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// CORSを許可する(フロントエンドからのアクセスを許可する)
app.use('/api/*', cors())

// 疎通確認用エンドポイント
app.get('api/check', async (c) => {
  try {
    const db = c.env.DB
    const res = await db.prepare('SELECT 1 as result').all<{ result: number }>()
    const result = res.results?.[0]?.result || 0
    return c.json({
      status: 'success',
      message: 'Database connected successfully!',
      result
    })
  } catch (e) {
    return c.json({
      status: 'error',
      error: e instanceof Error ? e.message : String(e)
    }, 500)
  }
})

// 睡眠データの保存 API
// zValidator でリクエストボディのバリデーションを行います
app.post('/api/sleep_logs', zValidator('json', sleepLogSchema), async (c) => {
  try {
    // バリデーション済みのデータを取得
    const body = c.req.valid('json')

    // D1 への保存クエリを実行
    const result = await c.env.DB.prepare(`
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
    `)
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
        body.rem_sleep_percentage
      )
      .run()

    if (result.success) {
      return c.json({ message: 'Success!', id: result.meta.last_row_id }, 201)
    } else {
      return c.json({ error: 'Database insert failed' }, 500)
    }

  } catch (err) {
    console.error(err)
    return c.json({ error: 'Server Error' }, 500)
  }
})
// 睡眠データの取得
app.get('/api/sleep_logs', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM sleep_logs ORDER BY sleep_date DESC LIMIT 30
    `).all();

    return c.json(results);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
export default app
