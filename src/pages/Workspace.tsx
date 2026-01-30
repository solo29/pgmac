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

interface QueryResult {
  columns: string[];
  rows: any[][];
  affected_rows: number;
  query_type: string;
}

interface ColumnDefinition {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_unique: boolean;
  enum_values?: string[] | null;
}

interface Session {
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

interface DbConfig {
  host: string;
  port: number;
  user: string;
  dbname: string;
}

interface SavedConnection {
  id: string;
  name: string;
  config: DbConfig;
}

interface WorkspaceTab {
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

// Helper to smart-quote identifiers
// Only quote if:
// 1. Contains caps (Postgres folds to lower unless quoted)
// 2. Contains special chars (non-alphanumeric/underscore)
// 3. Starts with digit
// 4. Is a reserved keyword (simplified list)
const maybeQuoteIdentifier = (name: string): string => {
  const needsQuotes =
    /[A-Z]/.test(name) || // Has caps
    /[^a-z0-9_]/.test(name) || // Has special chars
    /^[0-9]/.test(name) || // Starts with digit
    [
      "select",
      "from",
      "where",
      "table",
      "order",
      "group",
      "by",
      "limit",
      "offset",
      "insert",
      "update",
      "delete",
      "create",
      "alter",
      "drop",
      "grant",
      "revoke",
      "all",
      "distinct",
      "as",
      "join",
      "on",
      "inner",
      "outer",
      "left",
      "right",
      "full",
      "union",
      "except",
      "intersect",
      "user",
    ].includes(name.toLowerCase());

  return needsQuotes ? `"${name}"` : name;
};

export function Workspace() {
  const location = useLocation();

  const navigate = useNavigate();
  // We accept connectionId from navigation state, OR we might just be opening empty
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

  // Ref to track active tab for stale closures/callbacks
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
    // access activeTab via Ref if possible OR use the closure one.
    // If we use closure one, this function recreates every render.
    // But that's fine as long as we don't pass this function to memoized children.
    // We pass it to SqlEditor (onRunQuery).
    // And to Toolbar button.

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

      // Attempt to infer table context to enable editing
      // Matches: FROM table, FROM schema.table, FROM "schema"."table"
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

          // Only fetch columns if we suspect a simple select (crudely, if we matched a table)
          // This enables editing features (PK detection)
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

  // NOTE: Removed manual save_session invoke from runQuery line 185, relies on effect.
  // Actually, I need to make sure I deleted that block or line 185 in previous version.
  // The replace below targets the runQuery function body if I was rewriting it all,
  // but I'm skipping that for brevity if I can just rely on the effect.
  // Wait, I didn't remove the invoke("save_session"...) in runQuery in this tool call yet.
  // I should remove it to strictly rely on the effect and cleaner code.
  // But wait, the `runQuery` block isn't in my `ReplacementChunks` yet.
  // I will add a chunk to remove that call.

  // Persist session helper
  // We debounce this or call it on significant actions.
  // For now, let's call it on tab changes.
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
          last_table: null, // We track this via tab state now mostly, or we could keep it for legacy/single tab view support
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
    }, 1000); // 1s debounce

    return () => clearTimeout(timer);
  }, [tabs, activeTabId, activeConnectionId, activeSavedConnectionId, persistSession, isSessionLoaded]);

  // Existing: handleSelectTable
  // We removed the manual saveState call from here since useEffect handles it.
  const handleSelectTable = async (connectionId: string, savedId: string, schema: string, table: string) => {
    const tableKey = `${schema}.${table}`;
    setActiveConnectionId(connectionId);
    setGlobalConnectionId(connectionId);
    setActiveSavedConnectionId(savedId);

    // Instead of replacing current tab logic fully, maybe we check if "SQL Query" (unused) is active?
    // User expects selecting a table to open it.
    // If current tab is empty or generic, use it. Else new tab?
    // For now, let's behave like before: update ACTIVE tab.

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

      // Need to run query too
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
        // DEBUG: Alert session content count
        alert(`Loaded session with ${session.tabs?.length || 0} tabs.`);

        // 1. Load saved connections first so we can reconnect
        // We use the store's loadConnections but we need the raw list to iterate here or we rely on store invoke?
        // Let's just use invoke directly to avoid waiting on store state update if possible,
        // OR better, rely on store action which we already called in Sidebar?
        // Sidebar calls loadConnections on mount.
        // But we need the data NOW to map.
        const savedConns = await invoke<SavedConnection[]>("load_connections");

        // 2. Identify all unique saved_connection_ids from tabs + last_saved_connection_id
        const neededSavedIds = new Set<string>();
        if (session.last_saved_connection_id) neededSavedIds.add(session.last_saved_connection_id);

        const restoredTabsProto = session.tabs || [];
        restoredTabsProto.forEach((t) => {
          if (t.saved_connection_id) neededSavedIds.add(t.saved_connection_id);
        });

        // 3. Connect to all needed connections
        // We maintain a map of savedId -> liveId
        const savedToLiveMap = new Map<string, string>();

        for (const savedId of neededSavedIds) {
          const config = savedConns.find((c) => c.id === savedId);
          if (config) {
            try {
              // We use the store's connect action if possible to update UI state,
              // but we can't easily access the non-hook version of store actions inside this component
              // without using the hook.
              // We can use invoke("connect_db") but then the store won't know it's connected (green dot etc).
              // Ideally we sync with store.
              // The store uses `activeConnectionId` etc.
              // Let's manually invoke connect_db and then we might need to "hydrate" the store?
              // No, `loadConnections` in store just loads the list.
              // `connect` in store invokes connect_db and updates liveConnectionId.
              // We should try to use the store if possible, OR just invoke and let the user re-connect via UI if they want the green dot?
              // Better: invoke connect_db, and we need a way to tell the store "hey this saved ID has this live ID".
              // But the store state is local.
              // Actually, if we just invoke, the backend has the connection. The store frontend state `liveConnectionId` will be null.
              // That means the "Connected" green dot won't show up in Sidebar until user clicks it.
              // That's acceptable for now?
              // OR we can update the store. `useAppStore.setState`?
              // `useAppStore.getState().connect`?
              // Yes, Zustand has getState().

              // Let's try to use the store's connect method if we can, to keep UI in sync!
              // But `connect` updates `activeConnectionId` which might cause UI flicker if we do it for 10 tabs.
              // Let's just invoke raw for restoration speed and stability,
              // and maybe set the GLOBAL active connection at the end via store.

              const liveId = await invoke<string>("connect_db", { config: config.config });
              savedToLiveMap.set(savedId, liveId);

              // OPTIONAL: Update store state "quietly" if possible or just let it accept `liveConnectionId` logic?
              // The Sidebar maps connections via `liveConnectionId`. If we don't update store, Sidebar shows disconnected.
              // Workspace works because we pass `connectionId` to execution.
              // It would be nice if Sidebar showed connected.
              // We can call `useAppStore.getState()` potentially?
              // `useAppStore.getState().loadConnections()` was called.
              // Maybe we can dispatch an update.
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

        // 5. Restore Global Active Connection State
        let globalLiveId: string | null = null;
        if (session.last_saved_connection_id && savedToLiveMap.has(session.last_saved_connection_id)) {
          globalLiveId = savedToLiveMap.get(session.last_saved_connection_id)!;
          setActiveSavedConnectionId(session.last_saved_connection_id);

          // Update store active state so UI reflects it
          setGlobalConnectionId(globalLiveId);

          // Also try to update the store's `connections` list to show "Open" and "Connected"
          // This is a bit of a hack reaching into store from here, but helps UX
          const savedId = session.last_saved_connection_id;
          const dbName = savedConns.find((c) => c.id === savedId)?.name;
          if (dbName) setActiveDbName(dbName);
        } else {
          // If no global saved ID, maybe use the active tab's connection?
          const activeTab = restoredTabsProto.find((t) => t.id === session.active_tab_id) || restoredTabsProto[0];
          if (activeTab && activeTab.saved_connection_id && savedToLiveMap.has(activeTab.saved_connection_id)) {
            globalLiveId = savedToLiveMap.get(activeTab.saved_connection_id)!;
            setActiveConnectionId(globalLiveId); // Set local state
            setGlobalConnectionId(globalLiveId); // Set global store
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
    // NOTE: We need fresh state here, so we might need to access activeTab via ref or dependency.
    // However, activeTab changes on every keystroke (sql).
    // We only need connectionId, selectedTable, columnDefs, sql (for refresh).
    // If we include activeTab in dependency, this memoization is useless for typing!
    // Solution: Pass minimal stable IDs or use a ref for current active tab state if possible.
    // OR simpler: The expensive part is Table re-render during typing.
    // Typing updates activeTab.sql.
    // Does 'handleUpdateCell' need 'sql'? Yes for 'runQuery(activeTab.sql)'.

    // Actually, 'activeTab' changes reference on every edit.
    // We should probably rely on a Ref for the "latest active tab state" inside the callback,
    // OR split the state so 'sql' is separate from 'results/metadata'.

    // Let's go with the Ref approach for the callback logic to ensure stability during typing.

    // WAIT: 'runQuery' also needs to be stable or we just read from ref.
    // Let's see...

    // Quick fix: Just use the values from the arguments/closure? No, we need fresh state.
    // But we want the function identity to remain stable as long as *execution context* doesn't change.
    // The execution context (connection, etc) doesn't change on typing.
    // Only 'sql' changes on typing.

    // If I put 'activeTab' in dependency, it regenerates on typing.
    // If I don't, it uses stale 'sql' for refresh.

    // Strategy: Use a Ref to access the latest 'activeTab' inside the callback without re-creating the callback.
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

      // Refresh data
      // We use the Ref's SQL which is up to date (hopefully) or we just re-run the *same query that generated these results*.
      // Actually, if user typed garbage while editing, we might fail to refresh.
      // But standard behavior is to refresh view.
      await runQueryRef.current(currentTab.sql); // Need runQuery to be accessible or ref'd
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

function DeleteConfirmModal({
  isOpen,
  sql,
  isDeleting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  sql: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-600 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Confirm Deletion</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete this row? This action cannot be undone.</p>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-600 mb-6 max-h-40 overflow-y-auto">
          <code className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all whitespace-pre-wrap">{sql}</code>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-500 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? "Deleting..." : "Delete Row"}
          </button>
        </div>
      </div>
    </div>
  );
}
