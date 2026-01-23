import { z } from "zod";

// 睡眠ログのバリデーションスキーマ
export const sleepLogSchema = z
  .object({
    sleep_date: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "日付は YYYY-MM-DD 形式で入力してください。",
      ),
    sleep_score: z
      .number()
      .min(0)
      .max(100, "スコアは 0 から 100 の間で入力してください。"),
    bed_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "就寝時間は HH:MM 形式で入力してください。"),
    wakeup_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "起床時間は HH:MM 形式で入力してください。"),
    sleep_duration: z
      .number()
      .int()
      .positive("睡眠時間は正の整数（分）で入力してください。"),
    wakeup_count: z
      .number()
      .int()
      .min(0, "中途覚醒回数は 0 以上の整数で入力してください。"),
    deep_sleep_continuity: z
      .number()
      .min(0)
      .max(100, "深い睡眠の持続性は 0 から 100 の間で入力してください。"),
    deep_sleep_percentage: z
      .number()
      .min(0)
      .max(100, "深い睡眠の割合は 0 から 100 の間で入力してください。"),
    light_sleep_percentage: z
      .number()
      .min(0)
      .max(100, "浅い睡眠の割合は 0 から 100 の間で入力してください。"),
    rem_sleep_percentage: z
      .number()
      .min(0)
      .max(100, "レム睡眠の割合は 0 から 100 の間で入力してください。"),
  })
  .refine(
    (data) => {
      const sum =
        data.deep_sleep_percentage +
        data.light_sleep_percentage +
        data.rem_sleep_percentage;
      return sum === 100;
    },
    {
      message:
        "深い睡眠割合、浅い睡眠割合、レム睡眠割合の合計は100%である必要があります。",
    },
  );
