import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ConnectionManager } from "./connections/ConnectionManager";
import { Workspace } from "./pages/Workspace.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/connect" element={<ConnectionManager />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
