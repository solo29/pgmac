import { useState } from "react";
import { X, Save } from "lucide-react";
import Editor from "@monaco-editor/react";
import { ColumnDefinition } from "./types";
import { generatePreviewSql, getDateTimeInputType, formatDateValue, formatDateTimeValue, formatTimeValue } from "./helpers";

interface DataModalProps {
  value: any;
  tableName: string | null;
  columnName: string;
  originalRow: any[];
  columns: string[];
  columnDefs?: ColumnDefinition[];
  onClose: () => void;
  onSave?: (val: any) => Promise<void>;
  readOnly?: boolean;
}

export function DataModal({ value, tableName, columnName, originalRow, columns, columnDefs, onClose, onSave, readOnly }: DataModalProps) {
  const [editValue, setEditValue] = useState(
    typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : value === null ? "" : String(value),
  );
  const [isNull, setIsNull] = useState(value === null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (readOnly || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(isNull ? null : editValue);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const colDef = columnDefs?.find((c) => c.name === columnName);
  const isJsonType = colDef ? colDef.data_type === "json" || colDef.data_type === "jsonb" : false;
  const isObj = typeof value === "object" && value !== null;
  const isJsonMode = isJsonType || isObj;
  const dateTimeInputType = getDateTimeInputType(colDef?.data_type);

  // Determine available editor modes and default
  const getDefaultMode = (): string => {
    if (isJsonMode) return "json";
    if (colDef?.enum_values) return "enum";
    if (dateTimeInputType === "date") return "date";
    if (dateTimeInputType === "datetime-local") return "datetime";
    if (dateTimeInputType === "time") return "time";
    return "text";
  };

  const getAvailableModes = (): { value: string; label: string }[] => {
    const modes: { value: string; label: string }[] = [];
    if (isJsonMode) modes.push({ value: "json", label: "JSON Editor" });
    if (colDef?.enum_values) modes.push({ value: "enum", label: "Enum Selection" });
    if (dateTimeInputType === "date") modes.push({ value: "date", label: "Date Picker" });
    if (dateTimeInputType === "datetime-local") modes.push({ value: "datetime", label: "Date & Time Picker" });
    if (dateTimeInputType === "time") modes.push({ value: "time", label: "Time Picker" });
    modes.push({ value: "text", label: "Text Mode" });
    return modes;
  };

  const [editorMode, setEditorMode] = useState(getDefaultMode());
  const availableModes = getAvailableModes();

  const renderEditor = () => {
    // JSON Editor
    if (editorMode === "json" && isJsonMode) {
      return (
        <div className="flex-1 w-full border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="json"
            theme="vs-dark"
            value={isNull ? "" : editValue}
            onChange={(val) => setEditValue(val || "")}
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              readOnly: readOnly || isNull,
              fontSize: 12,
              wordWrap: "on",
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      );
    }

    // Enum dropdown
    if (editorMode === "enum" && colDef?.enum_values && !readOnly) {
      return (
        <select
          className="w-full p-2 font-mono text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed appearance-none disabled:opacity-75 disabled:cursor-not-allowed"
          value={isNull ? "" : editValue}
          onChange={(e) => setEditValue(e.target.value)}
          disabled={isNull}
        >
          {isNull && <option value="">(NULL)</option>}
          {colDef.enum_values.map((val) => (
            <option key={val} value={val}>
              {val}
            </option>
          ))}
        </select>
      );
    }

    // Date/Time pickers
    if (!readOnly && (editorMode === "date" || editorMode === "datetime" || editorMode === "time")) {
      const inputClassName =
        "w-full p-3 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-75 disabled:cursor-not-allowed";

      if (editorMode === "date") {
        return (
          <input
            type="date"
            className={inputClassName}
            value={isNull ? "" : formatDateValue(editValue)}
            onChange={(e) => setEditValue(e.target.value)}
            disabled={isNull}
          />
        );
      }

      if (editorMode === "datetime") {
        return (
          <input
            type="datetime-local"
            step="1"
            className={inputClassName}
            value={isNull ? "" : formatDateTimeValue(editValue)}
            onChange={(e) => {
              const val = e.target.value;
              setEditValue(val ? val.replace("T", " ") : "");
            }}
            disabled={isNull}
          />
        );
      }

      if (editorMode === "time") {
        return (
          <input
            type="time"
            step="1"
            className={inputClassName}
            value={isNull ? "" : formatTimeValue(editValue)}
            onChange={(e) => setEditValue(e.target.value)}
            disabled={isNull}
          />
        );
      }
    }

    // Default: textarea (Text Mode)
    return (
      <textarea
        className="flex-1 w-full p-4 font-mono text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 resize-none outline-none leading-relaxed disabled:opacity-75 disabled:cursor-not-allowed"
        value={isNull ? "" : editValue}
        onChange={(e) => setEditValue(e.target.value)}
        readOnly={readOnly || isNull}
        disabled={readOnly || isNull}
        placeholder={isNull ? "NULL" : "(empty)"}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col border border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">{readOnly ? "View Cell Details" : "Edit Cell Details"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-4">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500 font-medium">
              <select
                value={editorMode}
                onChange={(e) => setEditorMode(e.target.value)}
                className="text-xs bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                disabled={readOnly}
              >
                {availableModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-4">
                {readOnly && <span className="text-indigo-500">(Read-only)</span>}
                {!readOnly && (
                  <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isNull}
                      onChange={(e) => setIsNull(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    Set to NULL
                  </label>
                )}
              </div>
            </div>
            {renderEditor()}
          </div>

          <div className="flex-shrink-0">
            <div className="mb-2 text-xs text-gray-500 font-medium">SQL Preview</div>
            <div className="bg-gray-800 text-gray-200 p-3 rounded font-mono text-[10px] break-all border border-gray-600 max-h-32 overflow-y-auto">
              {readOnly
                ? "-- Read-only mode"
                : generatePreviewSql(tableName, columnName, isNull ? null : editValue, originalRow, columns, columnDefs)}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-600 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            Close
          </button>
          {!readOnly && onSave && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save size={16} />
                  Save Changes
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
