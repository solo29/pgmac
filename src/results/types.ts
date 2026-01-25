export interface QueryResult {
  columns: string[];
  rows: any[][];
  affected_rows: number;
}

export interface ColumnDefinition {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_unique: boolean;
  enum_values?: string[] | null;
}
