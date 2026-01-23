import { Hono } from "hono";
import { z } from "zod";
import { sleepLogSchema } from "../schemas";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper to calculate duration in minutes given "HH:MM" strings
function calculateDuration(bedTime: string, wakeupTime: string): number {
  const [bH, bM] = bedTime.split(":").map(Number);
  const [wH, wM] = wakeupTime.split(":").map(Number);
  
  let bMinutes = bH * 60 + bM;
  let wMinutes = wH * 60 + wM;

  if (wMinutes < bMinutes) {
    // Crossed midnight
    wMinutes += 24 * 60;
  }
  
  return wMinutes - bMinutes;
}

// Helper to strip quotes and trim
function cleanVal(val: string): string {
    return val ? val.replace(/^"|"$/g, '').trim() : "";
}

// Helper to parse percentages that might have % sign
function parsePercentage(val: string): number {
    const cleaned = cleanVal(val).replace('%', '');
    return Number(cleaned);
}

// CSV Export
app.get("/export", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM sleep_logs ORDER BY sleep_date ASC"
    ).all();

    if (!results || results.length === 0) {
       return c.text("日付,睡眠スコア,就寝時間,起床時間,中途覚醒回数,深い睡眠の持続性,深い睡眠割合,浅い睡眠割合,レム睡眠割合\n");
    }

    // Japanese headers, excluding sleep_duration
    const header = [
      "日付",
      "睡眠スコア",
      "就寝時間",
      "起床時間",
      "中途覚醒回数",
      "深い睡眠の持続性",
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

// CSV Import
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

    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    
    // Header detection
    const headerLineRaw = lines[0];
    const headerCols = headerLineRaw.split(",").map(cleanVal); // Simple comma split
    
    // Detect format based on header columns
    // We support two formats:
    // 1. Standard (Exported): 日付, 睡眠スコア, 就寝時間, 起床時間, 中途覚醒回数, ...
    // 2. Data.csv (User defined): 日付, 曜日, 点数, 入眠時間, 起床時間, 目が覚めた回数, ...
    
    // Map column names to index
    const colMap: Record<string, number> = {};
    headerCols.forEach((col, idx) => {
        colMap[col] = idx;
    });

    // Helper to get value by possible keys
    const getValue = (cols: string[], keys: string[]): string | undefined => {
        for (const key of keys) {
            // exact match or fuzzy? Let's try exact first (cleaned)
            for (const colHeader in colMap) {
                 if (colHeader === key || colHeader.includes(key)) { // bit loose check for "深い睡眠の持続性(点数)" vs "深い睡眠の持続性"
                     return cols[colMap[colHeader]];
                 }
            }
        }
        return undefined;
    };
    
    // We need to be careful with "includes" matching too broadly.
    // Let's define explicit mapping preference order.
    const findIndex = (keys: string[]): number => {
        for (const key of keys) {
            const idx = headerCols.findIndex(h => h === key || h.includes(key));
            if (idx !== -1) return idx;
        }
        return -1;
    }

    const idxDate = findIndex(["日付", "sleep_date"]);
    const idxScore = findIndex(["点数", "睡眠スコア", "sleep_score"]);
    const idxBed = findIndex(["入眠時間", "就寝時間", "bed_time"]);
    const idxWake = findIndex(["起床時間", "wakeup_time"]);
    const idxWakeCount = findIndex(["目が覚めた回数", "中途覚醒回数", "wakeup_count"]);
    const idxCont = findIndex(["深い睡眠の持続性", "deep_sleep_continuity"]);
    const idxDeep = findIndex(["深い睡眠の割合", "深い睡眠割合", "deep_sleep_percentage"]);
    const idxLight = findIndex(["浅い睡眠の割合", "浅い睡眠割合", "light_sleep_percentage"]);
    const idxRem = findIndex(["レム睡眠の割合", "レム睡眠割合", "rem_sleep_percentage"]);

    if (idxDate === -1) {
        // If we can't even find date, skip header check and fail? or assume specific order?
        // Let's assume header is present.
    }

    let dataLines = lines;
    // skip header
    if (idxDate !== -1) {
        dataLines = lines.slice(1);
    } else {
        // If no header detected, maybe it's raw data? But dangerous.
        // Assume first line is header if it fails to parse as date
         if (isNaN(Date.parse(lines[0].split(",")[0].replace(/\//g, '-')))) {
             dataLines = lines.slice(1);
         }
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    const db = c.env.DB;

    for (const [index, line] of dataLines.entries()) {
      // Split by comma. NOTE: Does not handle comma inside quotes strictly, but assuming data.csv structure.
      // data.csv uses quotes for headers but values seem simple.
      const cols = line.split(",").map(cleanVal);
      
      const getCol = (idx: number) => idx !== -1 ? cols[idx] : "";

      let sleepDate = getCol(idxDate);
      if (!sleepDate) continue; // skip empty

      sleepDate = sleepDate.replace(/\//g, "-");

      const bedTime = getCol(idxBed);
      const wakeupTime = getCol(idxWake);
      
      let duration = 0;
      if (bedTime && wakeupTime) {
          // ensure HH:MM
          const normBed = bedTime.indexOf(':') === 1 ? '0' + bedTime : bedTime;
          const normWake = wakeupTime.indexOf(':') === 1 ? '0' + wakeupTime : wakeupTime;
           if (/^\d{2}:\d{2}$/.test(normBed) && /^\d{2}:\d{2}$/.test(normWake)) {
               duration = calculateDuration(normBed, normWake);
           }
      }

      const rawData = {
        sleep_date: sleepDate,
        sleep_score: Number(getCol(idxScore)),
        bed_time: bedTime.padStart(5, '0'),
        wakeup_time: wakeupTime.padStart(5, '0'),
        sleep_duration: duration,
        wakeup_count: Number(getCol(idxWakeCount)),
        deep_sleep_continuity: Number(getCol(idxCont)),
        deep_sleep_percentage: parsePercentage(getCol(idxDeep)),
        light_sleep_percentage: parsePercentage(getCol(idxLight)),
        rem_sleep_percentage: parsePercentage(getCol(idxRem)),
      };

      // Validate
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

      // Insert
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
