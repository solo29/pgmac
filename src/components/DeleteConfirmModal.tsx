export default function DeleteConfirmModal({
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
