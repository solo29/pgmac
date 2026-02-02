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

// Date/Time formatting helpers for DataModal

// Helper to detect date/time type and return appropriate input type
export function getDateTimeInputType(dataType: string | undefined): "date" | "datetime-local" | "time" | null {
  if (!dataType) return null;
  const dt = dataType.toLowerCase();
  if (dt === "date") return "date";
  if (dt.includes("timestamp")) return "datetime-local";
  if (dt.startsWith("time")) return "time";
  return null;
}

// Format value for date input (YYYY-MM-DD)
// Avoid timezone issues by parsing manually
export function formatDateValue(val: string): string {
  if (!val) return "";
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Try to extract date portion from various formats
  const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  // Fallback: try Date parsing with local timezone
  const date = new Date(val);
  if (isNaN(date.getTime())) return val;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Format value for datetime-local input (YYYY-MM-DDTHH:mm:ss)
// Use local time to avoid timezone shifts
export function formatDateTimeValue(val: string): string {
  if (!val) return "";
  // If already in datetime-local format
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) return val;
  // Handle "YYYY-MM-DD HH:mm:ss" PostgreSQL format
  const pgMatch = val.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (pgMatch) return `${pgMatch[1]}T${pgMatch[2]}`;
  // Fallback: try Date parsing with local time
  const date = new Date(val);
  if (isNaN(date.getTime())) return val;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Format value for time input (HH:mm:ss)
export function formatTimeValue(val: string): string {
  if (!val) return "";
  const match = val.match(/^(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : val;
}
