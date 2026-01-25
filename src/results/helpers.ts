import { ColumnDefinition } from "./types";

// Export helpers
export function convertToCSV(columns: string[], rows: any[][]): string {
  const escapeCSV = (val: any) => {
    if (val === null) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escapeCSV).join(",");
  const dataRows = rows.map((row) => row.map(escapeCSV).join(","));
  return [header, ...dataRows].join("\n");
}

export function convertToTSV(columns: string[], rows: any[][]): string {
  const escapeTSV = (val: any) => {
    if (val === null) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    return str.replace(/\t/g, " ").replace(/\n/g, " ");
  };
  const header = columns.map(escapeTSV).join("\t");
  const dataRows = rows.map((row) => row.map(escapeTSV).join("\t"));
  return [header, ...dataRows].join("\n");
}

export function convertToJSON(columns: string[], rows: any[][]): string {
  const data = rows.map((row) => {
    const obj: Record<string, any> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
  return JSON.stringify(data, null, 2);
}

export function generatePreviewSql(
  tableName: string | null,
  columnName: string,
  newValue: string | null,
  originalRow: any[],
  columns: string[],
  columnDefs: ColumnDefinition[] = [],
) {
  if (!tableName) return "-- Cannot generate preview: No table selected";

  const [schema, table] = tableName.split(".");
  let sql = `UPDATE "${schema}"."${table}" SET "${columnName}" = `;
  
  if (newValue === null) {
    sql += "NULL";
  } else {
    sql += `'${newValue.replace(/'/g, "''")}'`;
  }
  
  sql += " WHERE ";

  let pkColNames = new Set(columnDefs.filter((c) => c.is_pk).map((c) => c.name));
  if (pkColNames.size === 0) {
    pkColNames = new Set(columnDefs.filter((c) => c.is_unique).map((c) => c.name));
  }
  const hasPks = pkColNames.size > 0;

  const conditions = originalRow
    .map((val, idx) => {
      const col = columns[idx];

      if (hasPks && !pkColNames.has(col)) {
        return null;
      }

      if (val === null) {
        return `"${col}" IS NULL`;
      }
      let valStr = String(val);
      if (typeof val === "object") {
        valStr = JSON.stringify(val);
      }
      return `"${col}" = '${valStr.replace(/'/g, "''")}'`;
    })
    .filter((c) => c !== null);

  sql += conditions.join(" AND ");
  return sql;
}

// Storage key prefix for column widths
const COLUMN_WIDTHS_STORAGE_KEY = "pgmac_column_widths";

export function getStoredColumnWidths(tableKey: string): Record<string, number> | null {
  try {
    const stored = localStorage.getItem(`${COLUMN_WIDTHS_STORAGE_KEY}_${tableKey}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function storeColumnWidths(tableKey: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(`${COLUMN_WIDTHS_STORAGE_KEY}_${tableKey}`, JSON.stringify(widths));
  } catch {
    // Ignore storage errors
  }
}
