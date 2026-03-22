import { Hono } from "hono";
import { sleepLogSchema } from "../schemas";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// "HH:MM"を変換して、睡眠時間を算出するヘルパー関数。
function calculateDuration(bedTime: string, wakeupTime: string): number {
  const [bH, bM] = bedTime.split(":").map(Number);
  const [wH, wM] = wakeupTime.split(":").map(Number);
  
  let bMinutes = bH * 60 + bM;
  let wMinutes = wH * 60 + wM;

  // 起床時間が就寝時間より前の場合
  if (wMinutes < bMinutes) {
    wMinutes += 24 * 60; // 24時間を追加して翌日扱いにする。
  }
  return wMinutes - bMinutes;
}

// 引用符の除去とトリムを行うヘルパー関数。CSV用。
function cleanVal(val: string): string {
    return val.replace(/^"|"$/g, '').trim();
}

// %を除去するヘルパー関数。
function parsePercentage(val: string): number {
    const cleaned = cleanVal(val).replace('%', '');
    return Number(cleaned);
}

// CSVエクスポート
app.get("/export", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM sleep_logs ORDER BY sleep_date ASC"
    ).all();

    if (!results || results.length === 0) {
       return c.text("日付,睡眠スコア,就寝時間,起床時間,中途覚醒回数,深い睡眠の持続性,睡眠時間,深い睡眠割合,浅い睡眠割合,レム睡眠割合\n");
    }

    // ヘッダー
    const header = [
      "日付",
      "睡眠スコア",
      "就寝時間",
      "起床時間",
      "中途覚醒回数",
      "深い睡眠の持続性",
      "睡眠時間",
      "深い睡眠割合",
      "浅い睡眠割合",
      "レム睡眠割合"
    ].join(",");

    const rows = results.map((row: any) => {
      return [
        row.sleep_date,
        row.sleep_score,
        row.bed_time,
        row.wakeup_time,
        row.wakeup_count,
        row.deep_sleep_continuity,
        row.sleep_duration,
        row.deep_sleep_percentage,
        row.light_sleep_percentage,
        row.rem_sleep_percentage
      ].join(",");
    });

    const csvContent = [header, ...rows].join("\n");

    return c.text(csvContent, 200, {
      "Content-Type": "text/csv; charset=utf-8", 
      "Content-Disposition": `attachment; filename="sleep_logs_${new Date().toISOString().split('T')[0]}.csv"`,
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// CSVインポート
app.post("/import", async (c) => {
  try {
    const contentType = c.req.header("Content-Type") || "";
    let csvText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (file && typeof file !== "string") {
        csvText = await (file as unknown as Blob).text();
      } else {
        return c.json({ error: "フォームデータにファイルが見つかりませんでした。" }, 400);
      }
    } else {
        csvText = await c.req.text();
    }

    if (!csvText) {
      return c.json({ error: "CSVの内容が空です。" }, 400);
    }

    // 行ごとに分割し、空行を除去。
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    
    // ヘッダーをスキップする
    const dataLines = lines.slice(1);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    const db = c.env.DB;

    // インデックスのマッピング。
    // 0: sleep_date
    // 1: sleep_score
    // 2: bed_time
    // 3: wakeup_time
    // 4: wakeup_count
    // 5: deep_sleep_continuity
    // 6: sleep_duration (Can be number or HH:MM)
    // 7: deep_sleep_percentage
    // 8: light_sleep_percentage
    // 9: rem_sleep_percentage

    for (const [index, line] of dataLines.entries()) {
      const cols = line.split(",").map(cleanVal);
      
      const getCol = (idx: number) => (cols.length > idx) ? cols[idx] : "";

      let sleepDate = getCol(0);
      if (!sleepDate) continue; // 睡眠日が空の場合はスキップ。

      sleepDate = sleepDate.replace(/\//g, "-");

      const score = Number(getCol(1));
      const bedTime = getCol(2).padStart(5, '0');
      const wakeupTime = getCol(3).padStart(5, '0');
      const wakeupCount = Number(getCol(4));
      const deepSleepCont = Number(getCol(5));
      
      let duration = 0;
      const durationStr = getCol(6);
      
      if (durationStr) {
          if (!isNaN(Number(durationStr))) {
               // Number型の場合
               duration = Number(durationStr);
          } else if (durationStr.includes(":")) {
               // 文字列型の場合(HH:MM or H:MM)
               const [h, m] = durationStr.split(":").map(Number);
               if (!isNaN(h) && !isNaN(m)) {
                   duration = h * 60 + m; // 数値に変換する
               }
          }
      }

      // 睡眠時間が0かつ、就寝時間と起床時間がある場合は、就寝時間と起床時間から睡眠時間を計算。
      if (duration === 0 && bedTime && wakeupTime) {
          const normBed = bedTime.indexOf(':') === 1 ? '0' + bedTime : bedTime;
          const normWake = wakeupTime.indexOf(':') === 1 ? '0' + wakeupTime : wakeupTime;
           if (/^\d{2}:\d{2}$/.test(normBed) && /^\d{2}:\d{2}$/.test(normWake)) {
               duration = calculateDuration(normBed, normWake);
           }
      }

      const deepSleepPct = parsePercentage(getCol(7));
      const lightSleepPct = parsePercentage(getCol(8));
      const remSleepPct = parsePercentage(getCol(9));

      const rawData = {
        sleep_date: sleepDate,
        sleep_score: score,
        bed_time: bedTime,
        wakeup_time: wakeupTime,
        sleep_duration: duration,
        wakeup_count: wakeupCount,
        deep_sleep_continuity: deepSleepCont,
        deep_sleep_percentage: deepSleepPct,
        light_sleep_percentage: lightSleepPct,
        rem_sleep_percentage: remSleepPct,
      };

      // バリデーション
      const parsed = sleepLogSchema.safeParse(rawData);
      if (!parsed.success) {
        errorCount++;
        errors.push(`${index + 1}行目: ${(parsed.error as any).errors.map((e: any) => e.message).join(", ")}`);
        continue;
      }

      const data = parsed.data;

      const existing = await db.prepare("SELECT 1 FROM sleep_logs WHERE sleep_date = ?")
        .bind(data.sleep_date)
        .first();

      if (existing) {
        skipCount++;
        continue;
      }

      const res = await db.prepare(`
        INSERT INTO sleep_logs (
          sleep_date, sleep_score, bed_time, wakeup_time, sleep_duration,
          wakeup_count, deep_sleep_continuity, deep_sleep_percentage,
          light_sleep_percentage, rem_sleep_percentage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.sleep_date, data.sleep_score, data.bed_time, data.wakeup_time, data.sleep_duration,
        data.wakeup_count, data.deep_sleep_continuity, data.deep_sleep_percentage,
        data.light_sleep_percentage, data.rem_sleep_percentage
      ).run();

      if (res.success) {
        successCount++;
      } else {
        errorCount++;
        errors.push(`${index + 1}行目: データベースへの保存に失敗しました`);
      }
    }

    return c.json({
      message: `インポート完了: ${successCount}件成功, ${skipCount}件スキップ(重複), ${errorCount}件エラー。`,
      details: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
