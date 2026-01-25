import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  dbname: string;
  password?: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: DbConfig;
}

export interface SchemaNode {
  name: string;
  tables: string[] | null;
  isOpen: boolean;
}

export interface ConnectionNode {
  data: SavedConnection;
  isOpen: boolean;
  liveConnectionId: string | null;
  schemas: SchemaNode[] | null;
  isLoading: boolean;
}

interface AppStore {
  connections: ConnectionNode[];
  activeConnectionId: string | null; // The globally selected connection (for highlighting/context)

  // Actions
  loadConnections: () => Promise<void>;
  toggleConnection: (savedId: string) => Promise<void>;
  toggleSchema: (savedId: string, schemaName: string) => Promise<void>;
  setGlobalConnectionId: (id: string | null) => void;

  // Helpers
  connect: (savedId: string) => Promise<string>; // Returns liveId
}

export const useAppStore = create<AppStore>((set, get) => ({
  connections: [],
  activeConnectionId: null,

  loadConnections: async () => {
    try {
      const saved = await invoke<SavedConnection[]>("load_connections");
      // Merge with existing state to preserve open states/liveIds if re-loading?
      // For now, simple override but try to match IDs?
      // Actually, if we just load on mount, we might overwrite live state if not careful.
      // But usually loadConnections is called once on startup.
      // IF we add a new connection, we want to reload but keep existing.

      set((state) => {
        const currentMap = new Map(state.connections.map((c) => [c.data.id, c]));

        const newNodes = saved.map((s) => {
          const existing = currentMap.get(s.id);
          if (existing) {
            return { ...existing, data: s }; // Update data, keep state
          }
          return {
            data: s,
            isOpen: false,
            liveConnectionId: null,
            schemas: null,
            isLoading: false,
          };
        });
        return { connections: newNodes };
      });
    } catch (err) {
      console.error("Failed to load connections:", err);
    }
  },

  setGlobalConnectionId: (id) => set({ activeConnectionId: id }),

  connect: async (savedId) => {
    const { connections } = get();
    const nodeIndex = connections.findIndex((c) => c.data.id === savedId);
    if (nodeIndex === -1) throw new Error("Connection not found");

    const node = connections[nodeIndex];
    if (node.liveConnectionId) return node.liveConnectionId;

    // Set loading
    set((state) => {
      const newConns = [...state.connections];
      newConns[nodeIndex] = { ...newConns[nodeIndex], isLoading: true };
      return { connections: newConns };
    });

    try {
      const liveId = await invoke<string>("connect_db", { config: node.data.config });
      const schemas = await invoke<string[]>("get_schemas", { connectionId: liveId });

      set((state) => {
        const newConns = [...state.connections];
        newConns[nodeIndex] = {
          ...newConns[nodeIndex],
          isLoading: false,
          liveConnectionId: liveId,
          schemas: schemas.map((name) => ({ name, tables: null, isOpen: false })),
          isOpen: true, // Auto open
        };
        return { connections: newConns, activeConnectionId: liveId }; // Auto select? Optional
      });
      return liveId;
    } catch (err) {
      console.error("Failed to connect", err);
      set((state) => {
        const newConns = [...state.connections];
        newConns[nodeIndex] = { ...newConns[nodeIndex], isLoading: false, isOpen: false };
        return { connections: newConns };
      });
      throw err;
    }
  },

  toggleConnection: async (savedId) => {
    const { connections, connect } = get();
    const nodeIndex = connections.findIndex((c) => c.data.id === savedId);
    if (nodeIndex === -1) return;

    const node = connections[nodeIndex];
    const wasOpen = node.isOpen;

    // Toggle UI immediately (optimistic)?
    // If opening and not connected, we need to connect.

    if (wasOpen) {
      // Just close
      set((state) => {
        const newConns = [...state.connections];
        newConns[nodeIndex].isOpen = false;
        return { connections: newConns };
      });
    } else {
      // Opening
      if (node.liveConnectionId) {
        // Just open
        set((state) => {
          const newConns = [...state.connections];
          newConns[nodeIndex].isOpen = true;
          return { connections: newConns };
        });
      } else {
        // Need to connect
        // Open immediately to show loading?
        set((state) => {
          const newConns = [...state.connections];
          newConns[nodeIndex].isOpen = true; // Open to show spinner
          return { connections: newConns };
        });
        await connect(savedId);
      }
    }
  },

  toggleSchema: async (savedId, schemaName) => {
    const { connections } = get();
    const nodeIndex = connections.findIndex((c) => c.data.id === savedId);
    if (nodeIndex === -1) return;

    const node = connections[nodeIndex];
    if (!node.schemas) return;

    const schemaIndex = node.schemas.findIndex((s) => s.name === schemaName);
    if (schemaIndex === -1) return;

    const schema = node.schemas[schemaIndex];

    if (schema.isOpen) {
      // Close
      set((state) => {
        const newConns = [...state.connections];
        const newSchemas = [...(newConns[nodeIndex].schemas || [])];
        newSchemas[schemaIndex].isOpen = false;
        newConns[nodeIndex].schemas = newSchemas;
        return { connections: newConns };
      });
    } else {
      // Open
      // Load tables if needed
      if (!schema.tables && node.liveConnectionId) {
        try {
          // Maybe add loading state for schema?
          const tables = await invoke<string[]>("get_tables", { connectionId: node.liveConnectionId, schema: schemaName });
          set((state) => {
            const newConns = [...state.connections];
            const newSchemas = [...(newConns[nodeIndex].schemas || [])];
            newSchemas[schemaIndex] = { ...newSchemas[schemaIndex], isOpen: true, tables };
            newConns[nodeIndex].schemas = newSchemas;
            return { connections: newConns };
          });
        } catch (err) {
          console.error(err);
        }
      } else {
        // Just toggle
        set((state) => {
          const newConns = [...state.connections];
          const newSchemas = [...(newConns[nodeIndex].schemas || [])];
          newSchemas[schemaIndex].isOpen = true;
          newConns[nodeIndex].schemas = newSchemas;
          return { connections: newConns };
        });
      }
    }
  },
}));
