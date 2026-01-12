import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{Bindings: Bindings}>()

// CORSを許可する(フロントエンドからのアクセスを許可する)
app.use('*', cors())

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

export default app
