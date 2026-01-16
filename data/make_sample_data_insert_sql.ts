
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface SchemaStrReplace {
    from: string;
    to: string;
}

interface ConvertRule {
    str_replace?: SchemaStrReplace;
    str_format?: string;
}

type ConvertDefinition = string | ConvertRule[];

interface SchemaColumn {
    name: string;
    type: string;
    primary_key?: boolean;
    omit?: boolean;
    convert?: ConvertDefinition;
}

interface Schema {
    table_name: string;
    columns: SchemaColumn[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = __dirname;
const SCHEMA_FILE = path.join(DATA_DIR, 'sample_data_schema.json');
const CSV_FILE = path.join(DATA_DIR, 'sample_data.csv');
const OUTPUT_SQL_FILE = path.join(DATA_DIR, 'insert_sample_data.sql');

function parseCsvLine(line: string): string[] {
    // 簡易CSVパーサー: カンマで分割します。
    // 注意: 引用符内のカンマは処理しません。
    return line.split(',').map(s => s.trim());
}

function formatTime(value: string): string {
    if (!value) return value;
    const parts = value.split(':');
    if (parts.length === 2) {
        const h = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        return `${h}:${m}`;
    }
    return value;
}

function applyExpression(value: string, expression: string): string {
    if (!value) return value;

    if (expression === '(HH*60)+MM') {
        const parts = value.split(':');
        if (parts.length === 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(h) && !isNaN(m)) {
                return String((h * 60) + m);
            }
        }
    }
    return value;
}

function escapeSqlValue(value: string, type: string): string {
    if (value === null || value === undefined || value === '') {
        return 'NULL';
    }

    const upperType = type.toUpperCase();
    if (upperType === 'INT' || upperType === 'INTEGER' || upperType === 'REAL') {
        return value;
    } else {
        // シングルクォートをエスケープ
        return `'${value.replace(/'/g, "''")}'`;
    }
}

function main() {
    // 1. スキーマの読み込み
    if (!fs.existsSync(SCHEMA_FILE)) {
        console.error(`スキーマファイルが見つかりません: ${SCHEMA_FILE}`);
        process.exit(1);
    }
    const schema: Schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf-8'));

    // 2. CSVの読み込み
    if (!fs.existsSync(CSV_FILE)) {
        console.error(`CSVファイルが見つかりません: ${CSV_FILE}`);
        process.exit(1);
    }
    const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length < 2) {
        console.error('CSVファイルが空か、ヘッダーがありません');
        process.exit(1);
    }

    // 3. CSVに含まれるカラムとSQL用カラムの決定
    // 'omit' が指定されたカラムはCSVにはあるが、SQLには含めない。
    const csvColumns = schema.columns.filter(col => !col.primary_key);
    const sqlColumns = schema.columns.filter(col => !col.primary_key && !col.omit);

    const insertStatements: string[] = [];

    // ヘッダーをスキップ
    const dataStartIndex = 1;

    for (let i = dataStartIndex; i < lines.length; i++) {
        const rawValues = parseCsvLine(lines[i]);

        // CSV行が期待されるカラム数を持っているか確認
        if (rawValues.length < csvColumns.length) {
            console.warn(`警告: 行 ${i + 1} のカラム数は ${rawValues.length} ですが、最低 ${csvColumns.length} が期待されます。スキップします。`);
            continue;
        }

        // CSVの値をスキーマのカラムにマッピング
        const rowValues: Record<string, string> = {};

        csvColumns.forEach((col, index) => {
            let val = rawValues[index];

            // convertプロパティによる変換の適用
            if (col.convert) {
                if (typeof col.convert === 'string') {
                    // 文字列の場合は式として評価
                    val = applyExpression(val, col.convert);
                } else if (Array.isArray(col.convert)) {
                    // 配列の場合は各ルールを順次適用
                    for (const rule of col.convert) {
                        if (rule.str_replace) {
                            val = val.split(rule.str_replace.from).join(rule.str_replace.to);
                        }
                        if (rule.str_format === 'HH:MM') {
                            val = formatTime(val);
                        }
                    }
                }
            }

            rowValues[col.name] = val;
        });

        // この行のSQL生成
        const colNames = sqlColumns.map(c => c.name).join(', ');
        const valStrings = sqlColumns.map(col => {
            const rawVal = rowValues[col.name];
            return escapeSqlValue(rawVal, col.type);
        }).join(', ');

        insertStatements.push(`INSERT INTO ${schema.table_name} (${colNames}) VALUES (${valStrings});`);
    }
    // 4. SQLファイルの書き込み
    fs.writeFileSync(OUTPUT_SQL_FILE, insertStatements.join('\n'), 'utf-8');
    console.log(`SQLファイルの生成に成功しました: ${OUTPUT_SQL_FILE}`);
}

main();