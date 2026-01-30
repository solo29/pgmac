import { SchemaNode } from "../store/useAppStore";
export interface SqlEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  onRunQuery: () => void;
  connectionId?: string | null;
  schemas?: SchemaNode[] | null;
}

export interface ColumnDefinition {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_unique: boolean;
  enum_values?: string[] | null;
}
