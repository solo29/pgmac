import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table as TableIcon, Plus, Trash2, Loader2 } from "lucide-react";
import clsx from "clsx";
import logo from "../assets/logo.jpg";
import { ConfirmModal } from "./ConfirmModal";

import { useAppStore } from "../store/useAppStore";

export interface SidebarProps {
  onSelectTable: (connectionId: string, savedId: string, schema: string, table: string) => void;
  onNewConnection: () => void;
}

export function Sidebar({ onSelectTable, onNewConnection }: SidebarProps) {
  const { connections, activeConnectionId, loadConnections, toggleConnection, toggleSchema } = useAppStore();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await invoke("delete_connection", { id: deleteId });
      loadConnections();
      setDeleteId(null);
    } catch (err) {
      console.error("Failed to delete", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTableClick = (liveId: string, savedId: string, schema: string, table: string) => {
    const fullTableName = `${liveId}.${schema}.${table}`; // Unique key for selection
    setSelectedTable(fullTableName);
    onSelectTable(liveId, savedId, schema, table);
  };

  return (
    <div className="flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
      <div className="flex h-12 items-center justify-between px-4 font-bold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">
        <div className="flex items-center">
          {/* <Database size={16} className="mr-2" /> */}
          <img src={logo} alt="Logo" className="w-5 h-5 rounded-sm mr-2" />
          Explorer
        </div>
        <button onClick={onNewConnection} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {connections.length === 0 && <div className="text-center text-sm text-gray-500 mt-4">No saved connections</div>}

        {connections.map((conn) => (
          <div key={conn.data.id} className="mb-1">
            <div
              className={clsx(
                "group flex items-center justify-between rounded-md pr-2 transition-colors",
                activeConnectionId === conn.liveConnectionId ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-gray-200 dark:hover:bg-gray-700",
              )}
            >
              <button
                onClick={() => {
                  toggleConnection(conn.data.id);
                }}
                className="flex flex-1 items-center px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
              >
                {conn.isLoading ? (
                  <Loader2 size={14} className="mr-1 animate-spin text-gray-500" />
                ) : conn.isOpen ? (
                  <ChevronDown size={14} className="mr-1 text-gray-500" />
                ) : (
                  <ChevronRight size={14} className="mr-1 text-gray-500" />
                )}

                <span className="truncate font-medium">{conn.data.name}</span>
                {conn.liveConnectionId && <div className="ml-2 w-1.5 h-1.5 rounded-full bg-green-500" />}
              </button>
              <button onClick={(e) => handleDeleteClick(e, conn.data.id)} className="text-gray-400 hover:text-red-500 p-1">
                <Trash2 size={14} />
              </button>
            </div>

            {conn.isOpen && conn.schemas && (
              <div className="ml-4 mt-1 border-l border-gray-300 pl-2 dark:border-gray-600">
                {conn.schemas.map((schema) => (
                  <div key={schema.name}>
                    <button
                      onClick={() => toggleSchema(conn.data.id, schema.name)}
                      className="flex w-full items-center rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      {schema.isOpen ? <ChevronDown size={12} className="mr-1 opacity-70" /> : <ChevronRight size={12} className="mr-1 opacity-70" />}
                      <span className="truncate">{schema.name}</span>
                    </button>
                    {schema.isOpen && schema.tables && (
                      <div className="ml-4 border-l border-gray-300 pl-2 dark:border-gray-600">
                        {schema.tables.map((table) => (
                          <button
                            key={table}
                            onClick={() => {
                              if (conn.liveConnectionId) {
                                handleTableClick(conn.liveConnectionId, conn.data.id, schema.name, table);
                              }
                            }}
                            className={clsx(
                              "flex w-full items-center rounded-md px-2 py-1 text-xs text-left",
                              selectedTable === `${conn.liveConnectionId}.${schema.name}.${table}` ||
                                (activeConnectionId === conn.liveConnectionId && selectedTable?.endsWith(`.${schema.name}.${table}`))
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-medium"
                                : "text-gray-500 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400",
                            )}
                          >
                            <TableIcon size={10} className="mr-2 opacity-50 flex-shrink-0" />
                            <span className="truncate">{table}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Connection"
        message="Are you sure you want to delete this connection? This action cannot be undone."
        confirmText="Delete"
        isDanger={true}
        isLoading={isDeleting}
      />
      
      <div className="p-2 text-[10px] text-gray-400 border-t border-gray-200 dark:border-gray-700 text-center">
        Build: 7
      </div>
    </div>
  );
}
