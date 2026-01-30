import { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import { Trash2 } from "lucide-react";
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DataModal } from "./DataModal";
import { TableFooter } from "./TableFooter";
import { QueryResult, ColumnDefinition } from "./types";
import CellRenderer from "./CellRenderer";
import { getStoredColumnWidths, storeColumnWidths } from "./helpers";

interface ResultsTableProps {
  data: QueryResult | null;
  error: string | null;
  isLoading: boolean;
  tableName?: string | null;
  columnDefs?: ColumnDefinition[];
  onUpdateCell?: (column: string, newValue: string | null, originalRow: any[], columns: string[]) => Promise<void>;
  onDeleteRow?: (row: any[]) => void;
  executionDurationMs?: number;
}

export const ResultsTable = memo(function ResultsTable({
  data,
  error,
  isLoading,
  tableName,
  columnDefs,
  onUpdateCell,
  onDeleteRow,
  executionDurationMs,
}: ResultsTableProps) {
  const [modalData, setModalData] = useState<{ value: any; row: any[]; colIdx: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Storage key based on tableName or a hash of columns
  const storageKey = useMemo(() => {
    if (tableName) return tableName;
    if (data?.columns) return `query_${data.columns.join("_")}`;
    return null;
  }, [tableName, data?.columns]);

  // Load persisted column widths
  useEffect(() => {
    if (storageKey && data?.columns) {
      const stored = getStoredColumnWidths(storageKey);
      if (stored) {
        setColumnWidths(stored);
      }
    }
  }, [storageKey, data?.columns]);

  // Save column widths when they change (debounced via isResizing)
  useEffect(() => {
    if (!isResizing && storageKey && Object.keys(columnWidths).length > 0) {
      storeColumnWidths(storageKey, columnWidths);
    }
  }, [isResizing, columnWidths, storageKey]);

  // Handle column resize
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(columnId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = currentWidth;
  }, []);

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(50, resizeStartWidth.current + delta);
      setColumnWidths((prev) => ({ ...prev, [isResizing]: newWidth }));
    },
    [isResizing],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);

  // Attach/detach mouse events for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      return () => {
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Convert rows to objects for TanStack Table
  // Use index-based keys to handle duplicate column names correctly
  const tableData = useMemo(() => {
    if (!data) return [];
    return data.rows.map((row) => {
      const obj: any = {};
      row.forEach((val, idx) => {
        obj[idx] = val;
      });
      obj._originalRow = row;
      return obj;
    });
  }, [data]);

  // Default column width
  const DEFAULT_WIDTH = 150;
  const MIN_WIDTH = 50;

  // Get width for a column
  // We use the unique column ID (name_index) for storage if possible,
  // currently `columnWidths` keyed by string.
  // Existing keys might be just names.
  // For duplicates, they might share width settings if we use name, or split if we use unique ID.
  // Let's use unique ID to prevent glitches.
  const getColumnWidth = useCallback(
    (columnId: string): number => {
      return columnWidths[columnId] || DEFAULT_WIDTH;
    },
    [columnWidths],
  );

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (!data) return [];

    const cols: ColumnDef<any>[] = data.columns.map((colName, colIdx) => {
      const uniqueId = `${colName}_${colIdx}`; // Ensure unique ID
      return {
        // Access data by index
        accessorFn: (row) => row[colIdx],
        id: uniqueId,
        header: colName,
        minSize: MIN_WIDTH,
        cell: (info) => (
          <CellRenderer value={info.getValue()} onZoom={(val) => setModalData({ value: val, row: info.row.original._originalRow, colIdx })} />
        ),
      };
    });

    if (onDeleteRow) {
      cols.push({
        id: "actions",
        header: "",
        size: 40,
        cell: (info) => (
          <button
            onClick={() => onDeleteRow(info.row.original._originalRow)}
            className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Delete Row"
          >
            <Trash2 size={14} />
          </button>
        ),
      });
    }

    return cols;
  }, [data, onDeleteRow]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 33,
    overscan: 10,
  });

  // Calculate total table width for proper scrolling
  const totalTableWidth = useMemo(() => {
    if (!data) return 0;
    const dataColsWidth = data.columns.reduce((sum, col) => sum + getColumnWidth(col), 0);
    const actionsWidth = onDeleteRow ? 40 : 0;
    return dataColsWidth + actionsWidth;
  }, [data, getColumnWidth, onDeleteRow]);

  // Sync horizontal scroll between header and body
  const handleBodyScroll = () => {
    if (tableContainerRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">Running query...</div>;
  }

  if (error) {
    return (
      <div className="h-full w-full overflow-auto bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-300">
        <pre className="font-mono text-sm whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (!data || (data.rows.length === 0 && data.columns.length === 0)) {
    // If it's a non-returning query (empty columns), we show affected rows.
    // Even if affected_rows is 0 (e.g. UPDATE ... WHERE 1=0).
    if (data && data.columns.length === 0) {
      const isSelect = data.query_type === "SELECT" || data.query_type === "WITH" || data.query_type === "VALUES";
      if (!isSelect) {
        return (
          <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
            Query executed successfully. Affected rows: {data.affected_rows}
          </div>
        );
      }
    }
    return <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">No results to display</div>;
  }

  return (
    <>
      <div className="h-full w-full flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <div ref={headerScrollRef} className="flex-shrink-0 overflow-hidden" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <div
            ref={tableRef}
            className="flex bg-gray-50 dark:bg-gray-800 shadow-sm"
            style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "auto", minWidth: "100%" }}
          >
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header) => {
                const columnId = header.column.id;
                const isActionsCol = columnId === "actions";
                const width = isActionsCol ? 40 : getColumnWidth(columnId);

                return (
                  <div
                    key={header.id}
                    className="relative px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-600 flex-shrink-0 select-none"
                    style={{ width: `${width}px`, minWidth: `${MIN_WIDTH}px` }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}

                    {/* Resize Handle */}
                    {!isActionsCol && (
                      <div
                        onMouseDown={(e) => handleResizeStart(e, columnId, width)}
                        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-indigo-500 transition-colors ${
                          isResizing === columnId ? "bg-indigo-500" : "bg-transparent"
                        }`}
                        style={{ touchAction: "none" }}
                      >
                        <div className="absolute top-0 right-0 w-4 h-full -translate-x-1/2" />
                      </div>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div ref={tableContainerRef} className="flex-1 overflow-auto" onScroll={handleBodyScroll}>
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
              width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
              minWidth: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "flex",
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const isActionsCol = columnId === "actions";
                    const width = isActionsCol ? 40 : getColumnWidth(columnId);

                    return (
                      <div
                        key={cell.id}
                        className="px-3 py-1 text-gray-900 dark:text-gray-300 align-top flex-shrink-0 text-xs"
                        style={{ width: `${width}px`, minWidth: `${MIN_WIDTH}px` }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer with Export Dropdown */}
        <TableFooter data={data} executionDurationMs={executionDurationMs} />
      </div>

      {modalData !== null && (
        <DataModal
          value={modalData.value}
          tableName={tableName || null}
          columnName={data ? data.columns[modalData.colIdx] : ""}
          originalRow={modalData.row}
          columns={data ? data.columns : []}
          columnDefs={columnDefs}
          onClose={() => setModalData(null)}
          onSave={async (newVal) => {
            if (onUpdateCell && data) {
              const colName = data.columns[modalData.colIdx];
              await onUpdateCell(colName, newVal, modalData.row, data.columns);
            }
            setModalData(null);
          }}
          readOnly={!onUpdateCell}
        />
      )}
    </>
  );
});
