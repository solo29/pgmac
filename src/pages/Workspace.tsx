import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Play, Plus } from "lucide-react";
import { SqlEditor } from "../editor/SqlEditor";
import { ResultsTable } from "../results/ResultsTable";
import { Sidebar } from "../components/Sidebar";
import { useAppStore } from "../store/useAppStore";
import { ErrorModal } from "../components/ErrorModal";
import { generatePreviewSql } from "../results/helpers";
import { QueryResult, ColumnDefinition, Session, SavedConnection, WorkspaceTab } from "./type";
import { maybeQuoteIdentifier } from "./helpers";
import DeleteConfirmModal from "../components/DeleteConfirmModal";

export function Workspace() {
  const location = useLocation();

  const navigate = useNavigate();
  const navState = location.state as { connectionId?: string; dbName?: string } | null;

  const { connections, setGlobalConnectionId } = useAppStore();

  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(navState?.connectionId || null);
  const [activeSavedConnectionId, setActiveSavedConnectionId] = useState<string | null>(null);
  const [activeDbName, setActiveDbName] = useState<string | null>(navState?.dbName || null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ sql: string; isOpen: boolean }>({ sql: "", isOpen: false });
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; error: string | null; sql: string }>({ isOpen: false, error: null, sql: "" });

  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    {
      id: "1",
      connectionId: navState?.connectionId || null,
      title: "SQL Query",
      dbName: navState?.dbName || undefined,
      sql: "SELECT * FROM information_schema.tables LIMIT 10;",
      results: null,
      error: null,
      isLoading: false,
      selectedTable: null,
      columnDefs: [],
      executionDurationMs: undefined,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("1");
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Track active tab for callbacks
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Helpers to update active tab
  const updateActiveTab = (updates: Partial<WorkspaceTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t)));
  };

  const addTab = () => {
    const newId = crypto.randomUUID();
    const newTab: WorkspaceTab = {
      id: newId,
      connectionId: activeConnectionId,
      savedConnectionId: activeSavedConnectionId,
      title: "SQL Query",
      dbName: activeDbName || undefined,
      sql: "",
      results: null,
      error: null,
      isLoading: false,
      selectedTable: null,
      columnDefs: [],
      executionDurationMs: undefined,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Don't close last tab

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const runQuery = async (queryToRun: string = activeTabRef.current.sql) => {
    // Use tab's connection preferably
    const targetConnectionId = activeTabRef.current.connectionId;

    if (!queryToRun.trim() || !targetConnectionId) return;

    // Reset state, including clearing selectedTable to prevent staleness/mismatches
    updateActiveTab({
      isLoading: true,
      error: null,
      results: null,
      executionDurationMs: undefined,
      selectedTable: null,
      columnDefs: [],
    });

    const startTime = performance.now();

    try {
      const data = await invoke<QueryResult>("run_query", {
        connectionId: targetConnectionId,
        query: queryToRun,
      });

      const duration = performance.now() - startTime;

      let newTitle = activeTab.title;
      let inferredSelectedTable: string | null = null;
      let inferredColumnDefs: ColumnDefinition[] = [];

      // Infer table context for editing (FROM table, FROM schema.table)
      const fromMatch = queryToRun.match(/FROM\s+([a-zA-Z0-9_."]+)(?:\s|$|;)/i);

      if (fromMatch && fromMatch[1]) {
        const raw = fromMatch[1];
        // Remove quotes
        const parts = raw.split(".").map((s) => s.replace(/["']/g, ""));

        let schema = "public";
        let table = "";

        if (parts.length === 2) {
          schema = parts[0];
          table = parts[1];
        } else if (parts.length === 1) {
          table = parts[0];
        }

        if (table) {
          // Update title if it's generic
          if (activeTab.title === "SQL Query" || activeTab.title.startsWith("Table: ")) {
            newTitle = table;
          }

          // Fetch columns to enable editing (PK detection)
          try {
            const cols = await invoke<ColumnDefinition[]>("get_columns", {
              connectionId: targetConnectionId,
              schema,
              table,
            });
            if (cols && cols.length > 0) {
              inferredColumnDefs = cols;
              inferredSelectedTable = `${schema}.${table}`;
            }
          } catch (e) {
            console.warn("Failed to suggest columns", e);
          }
        }
      }

      updateActiveTab({
        results: data,
        title: newTitle,
        executionDurationMs: duration,
        selectedTable: inferredSelectedTable,
        columnDefs: inferredColumnDefs,
      });
    } catch (err) {
      updateActiveTab({ error: String(err) });
      setErrorModal({ isOpen: true, error: String(err), sql: queryToRun });
    } finally {
      updateActiveTab({ isLoading: false });
    }
  };

  const runQueryRef = useRef(runQuery);
  runQueryRef.current = runQuery;

  // Persist session on changes
  const persistSession = useCallback(
    (currentTabs: WorkspaceTab[], activeId: string, currentActiveConnId: string | null, globalSavedConnId: string | null) => {
      // Map tabs to simple state
      const simpleTabs = currentTabs.map((t) => ({
        id: t.id,
        title: t.title,
        sql: t.sql,
        connection_id: t.connectionId,
        saved_connection_id: t.savedConnectionId,
        db_name: t.dbName || null,
      }));

      invoke("save_session", {
        session: {
          last_connection_id: currentActiveConnId,
          last_saved_connection_id: globalSavedConnId,
          last_table: null,
          last_query: null,
          tabs: simpleTabs,
          active_tab_id: activeId,
        },
      }).catch((e) => alert("Save failed: " + String(e)));
    },
    [],
  );

  // Effect to auto-save session on tab/active change
  useEffect(() => {
    if (!isSessionLoaded) return;

    const timer = setTimeout(() => {
      persistSession(tabs, activeTabId, activeConnectionId, activeSavedConnectionId);
    }, 1000);

    return () => clearTimeout(timer);
  }, [tabs, activeTabId, activeConnectionId, activeSavedConnectionId, persistSession, isSessionLoaded]);

  const handleSelectTable = async (connectionId: string, savedId: string, schema: string, table: string) => {
    const tableKey = `${schema}.${table}`;
    setActiveConnectionId(connectionId);
    setGlobalConnectionId(connectionId);
    setActiveSavedConnectionId(savedId);

    // Set current tab to selected table

    const qSchema = maybeQuoteIdentifier(schema);
    const qTable = maybeQuoteIdentifier(table);
    const newSql = `SELECT * FROM ${qSchema}.${qTable} LIMIT 100;`;

    updateActiveTab({
      connectionId,
      savedConnectionId: savedId,
      selectedTable: tableKey,
      title: tableKey,
      columnDefs: [],
      sql: newSql,
      isLoading: true,
      error: null,
      results: null,
      dbName: connections.find((c) => c.liveConnectionId === connectionId)?.data.name,
    });

    // saveState call REMOVED

    // Fetch columns metadata first to know about PKs
    try {
      const cols = await invoke<ColumnDefinition[]>("get_columns", {
        connectionId,
        schema,
        table,
      });

      // Fetch metadata and results
      const res = await invoke<QueryResult>("run_query", {
        connectionId,
        query: newSql,
      });

      updateActiveTab({ columnDefs: cols, results: res, isLoading: false });
    } catch (err) {
      updateActiveTab({ error: String(err), isLoading: false });
    }
  };

  useEffect(() => {
    // Load session on mount
    const loadSession = async () => {
      try {
        const session = await invoke<Session>("load_session");

        const savedConns = await invoke<SavedConnection[]>("load_connections");

        const neededSavedIds = new Set<string>();
        if (session.last_saved_connection_id) neededSavedIds.add(session.last_saved_connection_id);

        const restoredTabsProto = session.tabs || [];
        restoredTabsProto.forEach((t) => {
          if (t.saved_connection_id) neededSavedIds.add(t.saved_connection_id);
        });

        // 3. Connect to needed databases
        const savedToLiveMap = new Map<string, string>();
        for (const savedId of neededSavedIds) {
          const config = savedConns.find((c) => c.id === savedId);
          if (config) {
            try {
              const liveId = await invoke<string>("connect_db", { config: config.config });
              savedToLiveMap.set(savedId, liveId);
            } catch (err) {
              console.error(`Failed to restore connection ${savedId}`, err);
            }
          }
        }

        // 4. Restore tabs
        if (restoredTabsProto.length > 0) {
          const restoredTabs: WorkspaceTab[] = restoredTabsProto.map((t) => {
            let liveId = t.connection_id; // Default to stored live ID (likely dead)

            // Try to resolve new live ID from saved ID
            if (t.saved_connection_id && savedToLiveMap.has(t.saved_connection_id)) {
              liveId = savedToLiveMap.get(t.saved_connection_id)!;
            } else if (!t.saved_connection_id && t.connection_id) {
              // Legacy tab without saved ID?
              // If we have a global saved ID reconnected, maybe use that?
              // Or check if session.last_saved... works?
              if (session.last_saved_connection_id && savedToLiveMap.has(session.last_saved_connection_id)) {
                liveId = savedToLiveMap.get(session.last_saved_connection_id)!;
              }
            }

            return {
              id: t.id,
              title: t.title,
              sql: t.sql,
              connectionId: liveId || null,
              savedConnectionId: t.saved_connection_id || null, // Persist it
              dbName: t.db_name || undefined,
              results: null,
              error: null,
              isLoading: false,
              selectedTable: null,
              columnDefs: [],
              executionDurationMs: undefined,
            };
          });
          setTabs(restoredTabs);

          // Set active tab
          if (session.active_tab_id && restoredTabs.find((t) => t.id === session.active_tab_id)) {
            setActiveTabId(session.active_tab_id);
          } else {
            setActiveTabId(restoredTabs[0].id);
          }
        } else if (session.last_query) {
          // Legacy
          updateActiveTab({ sql: session.last_query });
        }

        // 5. Restore active connection
        let globalLiveId: string | null = null;
        if (session.last_saved_connection_id && savedToLiveMap.has(session.last_saved_connection_id)) {
          globalLiveId = savedToLiveMap.get(session.last_saved_connection_id)!;
          setActiveSavedConnectionId(session.last_saved_connection_id);
          setGlobalConnectionId(globalLiveId);

          const savedId = session.last_saved_connection_id;
          const dbName = savedConns.find((c) => c.id === savedId)?.name;
          if (dbName) setActiveDbName(dbName);
        } else {
          const activeTab = restoredTabsProto.find((t) => t.id === session.active_tab_id) || restoredTabsProto[0];
          if (activeTab && activeTab.saved_connection_id && savedToLiveMap.has(activeTab.saved_connection_id)) {
            globalLiveId = savedToLiveMap.get(activeTab.saved_connection_id)!;
            setActiveConnectionId(globalLiveId);
            setGlobalConnectionId(globalLiveId);
            setActiveSavedConnectionId(activeTab.saved_connection_id);
          }
        }

        if (globalLiveId) {
          setActiveConnectionId(globalLiveId);
        }
      } catch (e) {
        console.error("Failed to load session", e);
        // Alert helpful for prod debugging if console hidden
        alert("Failed to load session: " + String(e));
        // Do NOT set isSessionLoaded(true) if critical failure to avoid overwriting with empty state
        return;
      } finally {
        // We only set this if we didn't return early due to error
        setIsSessionLoaded(true);
      }
    };

    // Only load if explicit connection not passed via nav?
    if (!navState?.connectionId) {
      loadSession().catch((_) => {}); // Catch mainly to handle the early return case implicitly
    } else {
      setIsSessionLoaded(true);
    }
  }, []);

  const handleUpdateCell = useCallback(async (column: string, newValue: string | null, originalRow: any[], columns: string[]) => {
    // Use Ref for latest tab state to ensure callback stability
    const currentTab = activeTabRef.current;

    const targetConnectionId = currentTab.connectionId;
    if (!targetConnectionId || !currentTab.selectedTable) {
      alert("Can only update cells when a table is explicitly selected (no custom queries yet sorry!)");
      return;
    }

    try {
      // Construct row identifiers (colName, originalValue as string)
      // Construct row identifiers (colName, originalValue as string, dataType)
      const rowIdentifiers = originalRow.map((val, idx) => {
        let strVal: string | null = null;

        if (val !== null) {
          if (typeof val === "object") {
            strVal = JSON.stringify(val);
          } else {
            strVal = String(val);
          }
        }

        const colName = columns[idx];
        const colDef = currentTab.columnDefs.find((c) => c.name === colName);
        const dataType = colDef ? colDef.data_type : "text"; // Default to text if unknown

        return [colName, strVal, dataType];
      });

      // Filter row identifiers to only use keys if PKs exist
      let filteredIdentifiers = rowIdentifiers;

      let pkColNames = new Set(currentTab.columnDefs.filter((c) => c.is_pk).map((c) => c.name));
      if (pkColNames.size === 0) {
        pkColNames = new Set(currentTab.columnDefs.filter((c) => c.is_unique).map((c) => c.name));
      }
      if (pkColNames.size > 0) {
        filteredIdentifiers = rowIdentifiers.filter(([colName]) => pkColNames.has(colName as string));
      }
      // If no PKs, we use all columns (filteredIdentifiers = rowIdentifiers)

      // Hacky split of selectedTable "schema.table"
      const [schema, table] = currentTab.selectedTable!.split(".");

      const targetColDef = currentTab.columnDefs.find((c) => c.name === column);
      const colType = targetColDef ? targetColDef.data_type : null;

      await invoke("update_cell", {
        connectionId: targetConnectionId,
        schema,
        table,
        column,
        colType,
        newValue,
        rowIdentifiers: filteredIdentifiers, // Use filtered identifiers
      });

      // Refresh view
      await runQueryRef.current(currentTab.sql);
    } catch (err) {
      console.error("Update failed", err);
      const generatedSql = generatePreviewSql(currentTab.selectedTable, column, newValue, originalRow, columns, currentTab.columnDefs);
      setErrorModal({ isOpen: true, error: String(err), sql: generatedSql });
      throw err;
    }
  }, []); // Empty dependency! stable for memoization. Relies on refs.

  const handleDeleteRow = useCallback((row: any[]) => {
    const currentTab = activeTabRef.current;
    if (!currentTab.selectedTable || !currentTab.results) return;

    const [schema, table] = currentTab.selectedTable.split(".");

    // Identify PKs or Unique Keys
    let pkCols = currentTab.columnDefs.filter((c) => c.is_pk);
    if (pkCols.length === 0) {
      pkCols = currentTab.columnDefs.filter((c) => c.is_unique);
    }

    if (pkCols.length === 0) {
      alert("Cannot delete rows from a table without a Primary Key or Unique Key defined.");
      return;
    }

    // Build SQL
    const conditions: string[] = [];
    const colNames = currentTab.results.columns;

    pkCols.forEach((pk) => {
      const idx = colNames.indexOf(pk.name);
      if (idx !== -1) {
        const val = row[idx];
        let valStr = "NULL";

        if (val !== null) {
          if (typeof val === "number") {
            valStr = String(val);
          } else if (typeof val === "boolean") {
            valStr = String(val);
          } else if (typeof val === "object") {
            valStr = `'${JSON.stringify(val)}'`;
          } else {
            // Escape single quotes
            valStr = `'${String(val).replace(/'/g, "''")}'`;
          }
        } else {
          conditions.push(`"${pk.name}" IS NULL`);
          return;
        }
        conditions.push(`"${pk.name}" = ${valStr}`);
      }
    });

    if (conditions.length === 0) return;

    const sql = `DELETE FROM "${schema}"."${table}" WHERE ${conditions.join(" AND ")};`;
    setDeleteConfirm({ sql, isOpen: true });
  }, []); // Empty dependency!

  const executeDelete = async () => {
    const targetConnectionId = activeTab.connectionId;
    if (!targetConnectionId) return;
    setIsDeleting(true);
    try {
      // Verify we aren't just running a query that returns results
      await invoke("run_query", {
        connectionId: targetConnectionId,
        query: deleteConfirm.sql,
      });

      setDeleteConfirm({ ...deleteConfirm, isOpen: false });
      // Refresh data
      runQuery(activeTab.sql);
    } catch (err) {
      setErrorModal({ isOpen: true, error: String(err), sql: deleteConfirm.sql });
    } finally {
      setIsDeleting(false);
    }
  };

  const isSelect = activeTab.sql.trim().toLowerCase().startsWith("select");
  const hasOnKeyword = /\bON\b/i.test(activeTab.sql);
  const canEdit = isSelect && !hasOnKeyword;

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar onSelectTable={handleSelectTable} onNewConnection={() => navigate("/connect")} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <header className="flex flex-shrink-0 items-center justify-between bg-gray-50 px-4 pt-2 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-600">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar h-full">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 border-t border-x rounded-t-md text-sm font-medium cursor-pointer relative -mb-[1px] group ${
                  activeTabId === tab.id
                    ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 border-b-2 border-b-indigo-500 text-gray-700 dark:text-gray-200"
                    : "bg-transparent border-transparent text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex flex-col items-start leading-tight">
                  <span className="max-w-[150px] truncate">{tab.title}</span>
                  {tab.dbName && <span className="text-[10px] text-gray-400 font-normal opacity-80">{tab.dbName}</span>}
                </div>
                {tabs.length > 1 && (
                  <button onClick={(e) => closeTab(e, tab.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 ml-1">
                    <Plus size={12} className="rotate-45" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addTab} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex items-center gap-4 mb-1">
            {activeConnectionId && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full border border-green-200 dark:border-green-800">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Connected
              </span>
            )}
            <button
              onClick={() => runQuery(activeTab.sql)}
              disabled={activeTab.isLoading || !activeTab.sql.trim() || !activeConnectionId}
              className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Play size={14} />
              Run
            </button>
          </div>
        </header>

        {/* Editor Area */}
        <div className="h-[20%] p-4 pb-2">
          <SqlEditor
            value={activeTab.sql}
            onChange={(v) => updateActiveTab({ sql: v || "" })}
            onRunQuery={() => runQuery(activeTab.sql)}
            connectionId={activeTab.connectionId}
            schemas={connections.find((c) => c.liveConnectionId === activeTab.connectionId)?.schemas}
          />
        </div>

        {/* Results Area */}
        <div className="flex-1 p-4 pt-2 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 overflow-hidden">
          <ResultsTable
            data={activeTab.results}
            error={activeTab.error}
            isLoading={activeTab.isLoading}
            tableName={activeTab.selectedTable}
            columnDefs={activeTab.columnDefs}
            onUpdateCell={canEdit ? handleUpdateCell : undefined}
            onDeleteRow={canEdit ? handleDeleteRow : undefined}
            executionDurationMs={activeTab.executionDurationMs}
          />
        </div>

        {deleteConfirm.isOpen && (
          <DeleteConfirmModal
            isOpen={deleteConfirm.isOpen}
            sql={deleteConfirm.sql}
            isDeleting={isDeleting}
            onClose={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
            onConfirm={executeDelete}
          />
        )}

        <ErrorModal
          isOpen={errorModal.isOpen}
          onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
          error={errorModal.error}
          code={errorModal.sql}
          title="Query Failed"
        />
      </div>
    </div>
  );
}
