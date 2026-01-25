import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

export function ConnectionManager() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "My Connection",
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "",
    dbname: "postgres",
  });

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Just connect
      const connectionId = await invoke<string>("connect_db", {
        config: {
          ...formData,
          password: formData.password || null,
        },
      });
      // Navigate to workspace with this connection active
      navigate("/workspace", { state: { connectionId, dbName: formData.name } });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      await invoke("save_connection", {
        connection: {
          id,
          name: formData.name,
          config: {
            ...formData,
            password: formData.password || null,
          },
        },
      });
      // Also connect
      const connectionId = await invoke<string>("connect_db", {
        config: {
          ...formData,
          password: formData.password || null,
        },
      });

      // Navigate to workspace with this connection active
      navigate("/workspace", { state: { connectionId, dbName: formData.name } });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">New Connection</h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleConnect}>
          {error && <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-200">{error}</div>}
          <div className="-space-y-px rounded-md shadow-sm">
            <div className="mb-4">
              <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="name">
                Connection Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                placeholder="Connection Name (e.g. Local Prod)"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="host">
                  Host
                </label>
                <input
                  id="host"
                  name="host"
                  type="text"
                  required
                  className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                  placeholder="Host"
                  value={formData.host}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="port">
                  Port
                </label>
                <input
                  id="port"
                  name="port"
                  type="number"
                  required
                  className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                  placeholder="Port"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 5432 })}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="dbname">
                Database Name
              </label>
              <input
                id="dbname"
                name="dbname"
                type="text"
                required
                className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                placeholder="Database Name"
                value={formData.dbname}
                onChange={handleChange}
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="user">
                User
              </label>
              <input
                id="user"
                name="user"
                type="text"
                required
                className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                placeholder="User"
                value={formData.user}
                onChange={handleChange}
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="relative block w-full rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate("/workspace")}
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className={clsx(
                "group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
                loading && "cursor-not-allowed opacity-50",
              )}
            >
              Save & Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
