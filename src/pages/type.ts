export interface QueryResult {
  columns: string[];
  rows: any[][];
  affected_rows: number;
  query_type: string;
}

export interface ColumnDefinition {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_unique: boolean;
  enum_values?: string[] | null;
}

export interface Session {
  last_connection_id: string | null;
  last_saved_connection_id: string | null;
  last_table: string | null;
  last_query: string | null;
  tabs?: {
    id: string;
    title: string;
    sql: string;
    connection_id: string | null;
    saved_connection_id?: string | null;
    db_name?: string | null;
  }[];
  active_tab_id?: string | null;
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  dbname: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: DbConfig;
}

export interface WorkspaceTab {
  id: string;
  connectionId: string | null;
  savedConnectionId?: string | null;
  title: string;
  sql: string;
  results: QueryResult | null;
  error: string | null;
  isLoading: boolean;
  selectedTable: string | null;
  dbName?: string;
  columnDefs: ColumnDefinition[];
  executionDurationMs?: number;
}
