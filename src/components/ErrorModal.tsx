import { X, AlertTriangle, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  error: string | Error | null;
  code?: string;
}

export function ErrorModal({ isOpen, onClose, title = "Error", error, code }: ErrorModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !error) return null;

  const errorMessage = error instanceof Error ? error.message : String(error);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${errorMessage}\n\nCode:\n${code || "N/A"}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl border border-red-200 dark:border-red-900/50 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-red-50/50 dark:bg-red-900/10">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle size={20} />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="prose dark:prose-invert max-w-none">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Message:</p>
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-md font-mono text-sm border border-red-100 dark:border-red-900/30 whitespace-pre-wrap word-break-break-all">
              {errorMessage}
            </div>

            {code && (
              <>
                <p className="font-medium text-gray-700 dark:text-gray-300 mt-4 mb-2">Executed Query:</p>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md font-mono text-xs border border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                  {code}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center gap-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy Details"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
