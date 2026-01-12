import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{Bindings: Bindings}>()

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
  } catch(e) {
    return c.json({ 
      status: 'error',
      error: e instanceof Error ? e.message : String(e)
     }, 500)
  }
})

// 睡眠データの保存 API
app.post('/api/sleep', async (c) => {
  try {
    // フロントエンドから送られてくる JSON を取得
    const body = await c.req.json()

    // デバッグ用
    //console.log('Received body:', body)

    // D1 への保存クエリを実行
    // SQLインジェクションを防ぐため、必ず .bind() を使って値を渡します
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
      return c.json({ message: 'Success!' }, 201)
    } else {
      return c.json({ error: 'Database insert failed' }, 500)
    }

  } catch (err) {
    console.error(err)
    return c.json({ error: 'Invalid JSON or Server Error' }, 400)
  }
})

export default app
