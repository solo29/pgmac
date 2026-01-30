import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table as TableIcon, Plus, Trash2, Loader2, GripVertical, Pencil } from "lucide-react";
import clsx from "clsx";
import logo from "../assets/logo.jpg";
import { ConfirmModal } from "./ConfirmModal";

import { useAppStore, ConnectionNode } from "../store/useAppStore";

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SidebarProps {
  onSelectTable: (connectionId: string, savedId: string, schema: string, table: string) => void;
  onNewConnection: () => void;
}

interface SortableConnectionItemProps {
  conn: ConnectionNode;
  activeConnectionId: string | null;
  selectedTable: string | null;
  onToggle: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onRename: (id: string, newName: string) => void;
  onToggleSchema: (id: string, schema: string) => void;
  onTableClick: (liveId: string, savedId: string, schema: string, table: string) => void;
}

function SortableConnectionItem({
  conn,
  activeConnectionId,
  selectedTable,
  onToggle,
  onDelete,
  onRename,
  onToggleSchema,
  onTableClick,
}: SortableConnectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: conn.data.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    position: "relative" as const,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conn.data.name);

  const handleRenameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (editName.trim()) {
      onRename(conn.data.id, editName.trim());
    } else {
      setEditName(conn.data.name); // Revert if empty
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditName(conn.data.name);
      setIsEditing(false);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className={clsx("mb-1", isDragging && "opacity-50")}>
      <div
        className={clsx(
          "group flex items-center justify-between rounded-md pr-2 transition-colors",
          activeConnectionId === conn.liveConnectionId ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-gray-200 dark:hover:bg-gray-700",
        )}
      >
        <div className="flex flex-1 items-center py-1.5 overflow-hidden">
          <button onClick={() => onToggle(conn.data.id)} className="flex items-center text-sm text-gray-700 dark:text-gray-300 mr-2">
            {conn.isLoading ? (
              <Loader2 size={14} className="animate-spin text-gray-500" />
            ) : conn.isOpen ? (
              <ChevronDown size={14} className="text-gray-500" />
            ) : (
              <ChevronRight size={14} className="text-gray-500" />
            )}
          </button>

          {conn.liveConnectionId && !isEditing && <div className="mr-2 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}

          {isEditing ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRenameSubmit()}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-0 px-1 py-0.5 text-sm rounded border border-indigo-400 focus:outline-none dark:bg-gray-800 dark:text-gray-200"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button onClick={() => onToggle(conn.data.id)} className="flex-1 text-left truncate font-medium text-sm text-gray-700 dark:text-gray-300">
              {conn.data.name}
            </button>
          )}
        </div>

        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditName(conn.data.name);
              }}
              className="text-gray-400 hover:text-indigo-500 p-1"
              title="Rename"
            >
              <Pencil size={12} />
            </button>
          )}
          <button onClick={(e) => onDelete(e, conn.data.id)} className="text-gray-400 hover:text-red-500 p-1">
            <Trash2 size={14} />
          </button>
        </div>

        <div {...attributes} {...listeners} className="cursor-grab p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <GripVertical size={14} />
        </div>
      </div>

      {conn.isOpen && conn.schemas && (
        <div className="ml-4 mt-1 border-l border-gray-300 pl-2 dark:border-gray-600">
          {conn.schemas.map((schema) => (
            <div key={schema.name}>
              <button
                onClick={() => onToggleSchema(conn.data.id, schema.name)}
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
                          onTableClick(conn.liveConnectionId, conn.data.id, schema.name, table);
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
  );
}

export function Sidebar({ onSelectTable, onNewConnection }: SidebarProps) {
  const { connections, activeConnectionId, loadConnections, toggleConnection, toggleSchema, reorderConnections, renameConnection } = useAppStore();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = connections.findIndex((c) => c.data.id === active.id);
      const newIndex = connections.findIndex((c) => c.data.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Create new array of SavedConnections
        const newConnections = arrayMove(connections, oldIndex, newIndex).map((c) => c.data);
        reorderConnections(newConnections);
      }
    }
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={connections.map((c) => c.data.id)} strategy={verticalListSortingStrategy}>
            {connections.map((conn) => (
              <SortableConnectionItem
                key={conn.data.id}
                conn={conn}
                activeConnectionId={activeConnectionId}
                selectedTable={selectedTable}
                onToggle={toggleConnection}
                onDelete={handleDeleteClick}
                onRename={renameConnection}
                onToggleSchema={toggleSchema}
                onTableClick={handleTableClick}
              />
            ))}
          </SortableContext>
        </DndContext>
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

      <div className="p-2 text-[10px] text-gray-400 border-t border-gray-200 dark:border-gray-700 text-center">Build: 9</div>
    </div>
  );
}
