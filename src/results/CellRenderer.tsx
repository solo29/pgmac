import { Maximize2 } from "lucide-react";

interface CellRendererProps {
  value: any;
  onZoom: (val: any) => void;
}

function CellRenderer({ value, onZoom }: CellRendererProps) {
  const isNull = value === null;

  // JSON handling
  let isJson = false;
  let jsonVal = value;

  if (!isNull) {
    if (typeof value === "object") {
      isJson = true;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          jsonVal = JSON.parse(value);
          isJson = true;
        } catch {
          /* not json */
        }
      }
    }
  }

  if (isJson) {
    return (
      <div className="relative group flex items-center justify-between w-full">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 min-w-0 w-full cursor-default">
          <span
            className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate opacity-70 flex-1 text-left"
            title={JSON.stringify(jsonVal)}
          >
            {JSON.stringify(jsonVal)}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZoom(jsonVal);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  if (isNull) {
    return (
      <div className="group flex items-center justify-between w-full h-full min-h-[1.5rem]">
        <span className="text-gray-400 italic text-xs flex-1">null</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZoom(value);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  const strValue = String(value);

  if (strValue === "") {
    return (
      <div className="group flex items-center justify-between w-full h-full min-h-[1.5rem]">
        <span className="text-gray-300 dark:text-gray-600 text-[10px] select-none">(empty)</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZoom(value);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between w-full h-full min-h-[1.5rem]">
      <div
        className="text-xs leading-4 whitespace-nowrap overflow-x-hidden hover:overflow-x-auto no-scrollbar flex-1"
        title={strValue.length > 100 ? strValue.substring(0, 500) + "..." : strValue}
      >
        {strValue}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onZoom(value);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
      >
        <Maximize2 size={12} />
      </button>
    </div>
  );
}

export default CellRenderer;
