import Editor, { OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { SchemaNode } from "../store/useAppStore";
import { invoke } from "@tauri-apps/api/core";

interface SqlEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  onRunQuery: () => void;
  connectionId?: string | null;
  schemas?: SchemaNode[] | null;
}

interface ColumnDefinition {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_unique: boolean;
  enum_values?: string[] | null;
}

export function SqlEditor({ value, onChange, onRunQuery, connectionId, schemas }: SqlEditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const onRunQueryRef = useRef(onRunQuery);
  const completionDisposableRef = useRef<any>(null);

  // Cache for column definitions: table_name -> columns
  const columnsCache = useRef<Map<string, ColumnDefinition[]>>(new Map());
  
  // Debounce timer for parsing
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isMounted, setIsMounted] = useState(false);

  // Update ref on render so the command handler always has the latest version
  onRunQueryRef.current = onRunQuery;

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsMounted(true);

    // Add Ctrl+Enter command to run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunQueryRef.current();
    });
  };
  
  // ... (triggerColumnFetch omitted for brevity, logic remains same)

  // Effect: Debounced Parse
  useEffect(() => {
    if (!value || !connectionId || !isMounted) return;
    // ... (rest of parsing logic)
  }, [value, connectionId, schemas, isMounted]);

  // Register Completion Provider
  useEffect(() => {
    if (!monacoRef.current || !connectionId || !isMounted) return;

    // ... (rest of provider logic)
  }, [connectionId, schemas, isMounted]);

  // Helper to trigger background fetch
  const triggerColumnFetch = (targetSchema: string, tableName: string) => {
      const cacheKey = `${targetSchema}.${tableName}`;
      if (columnsCache.current.has(cacheKey)) {
          console.log("DEBUG: Cache hit for", cacheKey);
          return;
      }

      // console.log("DEBUG: Fetching columns for", cacheKey);
      invoke<ColumnDefinition[]>("get_columns", {
          connectionId,
          schema: targetSchema,
          table: tableName
      }).then(cols => {
          // console.log("DEBUG: Fetched columns for", cacheKey, cols);
          columnsCache.current.set(cacheKey, cols);
          
          // Force re-trigger suggestions if editor is focused?
          // This ensures that if the user was waiting, suggestions pop up.
          if (editorRef.current) {
              // editorRef.current.trigger('keyboard', 'editor.action.triggerSuggest', {});
          }
      }).catch(() => {
           // console.error("DEBUG: Failed bg fetch", err);
      });
  };

  // Effect: Debounced Parse of SQL Parsing
  useEffect(() => {
    // console.log("DEBUG: Effect running. ConnectionId:", connectionId, "Schemas:", schemas);
    if (!value || !connectionId) return;

    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);

    parseTimerRef.current = setTimeout(() => {
        // Parse Tables from value
        // Debug regex
        // console.log("DEBUG: Parsing SQL...", value);
        const matches = [...value.matchAll(/\b(?:FROM|JOIN)\s+(?:["']?([a-zA-Z0-9_]+)["']?\.)?["']?([a-zA-Z0-9_]+)["']?/gi)];
        // console.log("DEBUG: Matches found:", matches.map(m => m[0]));
        
        matches.forEach(m => {
             const schema = m[1] || "public"; 
             const table = m[2];
             
             let finalSchema = schema;
             // Try to resolve schema if missing
             if (!m[1] && schemas) {
                for (const s of schemas) {
                    if (s.tables?.includes(table)) {
                        finalSchema = s.name;
                        break;
                    }
                }
             }
             
             // console.log("DEBUG: Context parsing found table:", finalSchema, table);
             // Pre-fetch columns
             triggerColumnFetch(finalSchema, table);
        });

    }, 500); // 500ms debounce

    return () => {
        if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    };
  }, [value, connectionId, schemas, isMounted]);


  // Register Completion Provider
  useEffect(() => {
    if (!monacoRef.current || !connectionId || !isMounted) return;

    const monaco = monacoRef.current;

    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
    }

    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [".", " "],
      provideCompletionItems: (model: any, position: any) => {
        // console.log("DEBUG: provideCompletionItems triggered");
        
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];

        // 1. Schemas
        if (schemas) {
            schemas.forEach((s) => {
                suggestions.push({
                    label: s.name,
                    kind: monaco.languages.CompletionItemKind.Module,
                    insertText: s.name,
                    range: range,
                    detail: "Schema",
                });
            });
        }

        // 2. Tables (schema.context)
        const matchDot = textUntilPosition.match(/([a-zA-Z0-9_]+)\.$/);
        if (matchDot) {
            const schemaName = matchDot[1];
            const schema = schemas?.find(s => s.name === schemaName);
            if (schema && schema.tables) {
                 schema.tables.forEach(t => {
                    suggestions.push({
                        label: t,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: t,
                        range: range,
                        detail: "Table",
                    });
                 });
            }
        }

        // 3. Columns (Explicit & Implicit)
        
        // Context 1: Explicit Table Dot?
        const matchTable = textUntilPosition.match(/(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\.$/);
        
        // Collect cache keys to look up
        const tablesToSuggest = new Set<string>();

        if (matchTable) {
             // console.log("DEBUG: Explicit table match:", matchTable[0]);
             const possibleSchema = matchTable[1];
             const tableName = matchTable[2];
             
             let targetSchema = possibleSchema || "public";
             if (!possibleSchema && schemas) {
                 for (const s of schemas) {
                     if (s.tables?.includes(tableName)) {
                         targetSchema = s.name;
                         break;
                     }
                 }
             }
             const key = `${targetSchema}.${tableName}`;
             tablesToSuggest.add(key);

             // Trigger fetch if not cached (for next time)
             if (!columnsCache.current.has(key)) {
                 // console.log("DEBUG: Missing cache for explicit table, triggering fetch:", key);
                 triggerColumnFetch(targetSchema, tableName);
             }
        } 
        
        // Context 2: Implicit (Identifier typing, no dot)
        if (!matchDot && !matchTable) {
            // Re-parsing here might be fast enough for "tables in scope" 
            const fullText = model.getValue();
            const tableMatches = [...fullText.matchAll(/\b(?:FROM|JOIN)\s+(?:["']?([a-zA-Z0-9_]+)["']?\.)?["']?([a-zA-Z0-9_]+)["']?/gi)];
            
            tableMatches.forEach(m => {
                const schema = m[1] || "public"; 
                const table = m[2];
                let sName = schema;
                if (!m[1] && schemas) {
                    for (const s of schemas) {
                        if (s.tables?.includes(table)) {
                            sName = s.name;
                            break;
                        }
                    }
                }
                tablesToSuggest.add(`${sName}.${table}`);
            });
        }

        // Populate suggestions from Cache
        if (tablesToSuggest.size > 0) {
            // console.log("DEBUG: Suggesting columns for tables:", [...tablesToSuggest]);
            for (const key of tablesToSuggest) {
                const cols = columnsCache.current.get(key);
                if (cols) {
                    cols.forEach(c => {
                         suggestions.push({
                             label: c.name,
                             kind: monaco.languages.CompletionItemKind.Field,
                             insertText: c.name,
                             detail: `${c.data_type} (${key})`,
                             range: range,
                             sortText: "0_" + c.name 
                         });
                    });
                } else {
                    // console.log("DEBUG: No columns in cache for", key);
                }
            }
        }

        return { suggestions };
      },
    });

    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
    };
  }, [connectionId, schemas, isMounted]); // Re-register if schemas change

  return (
    <div className="h-full w-full overflow-hidden rounded-md border border-gray-300 dark:border-gray-600">
      <Editor
        height="100%"
        defaultLanguage="sql"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: "on",
          automaticLayout: true,
          padding: { top: 16 },
          suggest: {
            showKeywords: false,
          },
        }}
      />
    </div>
  );
}
