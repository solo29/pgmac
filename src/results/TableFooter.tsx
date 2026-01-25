import { useState, useRef, useEffect, useCallback } from "react";
import { Download, Check, ChevronDown } from "lucide-react";
import { convertToCSV, convertToJSON, convertToTSV } from "./helpers";
import { QueryResult } from "./types";

interface TableFooterProps {
  data: QueryResult | null;
  executionDurationMs?: number | null;
}

export function TableFooter({ data, executionDurationMs }: TableFooterProps) {
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    if (exportDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [exportDropdownOpen]);

  // Copy to clipboard helper
  const handleCopyAs = useCallback(
    async (format: "csv" | "json" | "tsv") => {
      if (!data) return;
      let text = "";
      switch (format) {
        case "csv":
          text = convertToCSV(data.columns, data.rows);
          break;
        case "json":
          text = convertToJSON(data.columns, data.rows);
          break;
        case "tsv":
          text = convertToTSV(data.columns, data.rows);
          break;
      }
      try {
        await navigator.clipboard.writeText(text);
        setCopyFeedback(format.toUpperCase());
        setTimeout(() => setCopyFeedback(null), 1500);
      } catch {
        // fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopyFeedback(format.toUpperCase());
        setTimeout(() => setCopyFeedback(null), 1500);
      }
      setExportDropdownOpen(false);
    },
    [data],
  );

  if (!data) return null;

  return (
    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {data.rows.length.toLocaleString()} row{data.rows.length !== 1 ? "s" : ""}
        {executionDurationMs !== undefined && executionDurationMs !== null && (
          <span className="ml-1 opacity-75">({executionDurationMs.toFixed(0)}ms)</span>
        )}
      </span>

      <div ref={exportDropdownRef} className="relative">
        <button
          onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          {copyFeedback ? (
            <>
              <Check size={14} className="text-green-500" />
              <span className="text-green-600 dark:text-green-400">Copied {copyFeedback}</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>Export</span>
              <ChevronDown size={12} />
            </>
          )}
        </button>

        {exportDropdownOpen && (
          <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px] z-50">
            <button
              onClick={() => handleCopyAs("csv")}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              Copy as CSV
            </button>
            <button
              onClick={() => handleCopyAs("json")}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              Copy as JSON
            </button>
            <button
              onClick={() => handleCopyAs("tsv")}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              Copy as TSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
