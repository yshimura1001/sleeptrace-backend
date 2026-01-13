import * as fs from 'fs';
import * as path from 'path';

/**
 * CSVの1行をパースして配列にする（簡易版）
 * ※カンマを含むデータがある場合は csv-parse などのライブラリ使用を推奨
 */
function parseCsvLine(line: string): string[] {
    return line.split(',').map(cell => cell.trim());
}

/**
 * SQLite用に値をエスケープする
 */
function escapeSqlValue(value: string): string {
    if (value === '' || value === undefined || value === null) {
        return 'NULL';
    }
    // 数値（整数または小数）かつパーセント記号が含まれない場合は数値として扱う
    if (!isNaN(Number(value)) && !value.includes('%')) {
        return value;
    }
    // 文字列の場合はシングルクォートで囲み、内部のシングルクォートをエスケープ
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
}

async function convertCsvToSql(csvFilePath: string, tableName: string) {
    const sqlFilePath = csvFilePath.replace('.csv', '.sql');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length < 2) {
        console.error('CSVファイルが空か、データが不足しています。');
        return;
    }
    type DataType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
    type Column = {
      name: string,
      type: DataType
    }
    // カラム名の定義
    const columnNames = [
        'sleep_date', 'sleep_score', 'bed_time', 'wakeup_time',
        'wakeup_count', 'deep_sleep_continuity', 'sleep_duration',
        'deep_sleep_percentage', 'light_sleep_percentage', 'rem_sleep_percentage', 'total_percentage'
    ];
    const columns: Column[] = [
        {name: 'sleep_date', type: 'TEXT'},
        {name: 'sleep_score', type: 'INTEGER'},
        {name: 'bed_time', type: 'INTEGER'},
        {name: 'wakeup_time', type: 'INTEGER'},
        {name: 'wakeup_count', type: 'INTEGER'},
        {name: 'sleep_duration', type: 'INTEGER'},
        {name: 'deep_sleep_continuity', type: 'INTEGER'},
        {name:'deep_sleep_percentage', 'light 'deep_sleep_continuity', type: 'INTEGER'}, 
        'wakeup_count', 'deep_sleep_continuity', '_sleep_percentage', 'rem_sleep_percentage', 'total_percentage'
    ];

    const insertStatements: string[] = [];

    // 2行目（データ開始行）からループ
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        
        // カラム数に合わせて値を調整
        const formattedValues = values.map(val => escapeSqlValue(val));
        
        const sql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${formattedValues.join(', ')});`;
        insertStatements.push(sql);
    }

    fs.writeFileSync(sqlFilePath, insertStatements.join('\n'), 'utf-8');
    console.log(`SQLファイルが生成されました: ${sqlFilePath}`);
}

// 実行
const fileName = 'sample_data.csv';
convertCsvToSql(fileName, 'sleep_logs');