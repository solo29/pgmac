# pgmac

A fast, native PostgreSQL client for macOS built with Tauri.

<p align="center">
  <img src="logo.jpg" alt="pgmac logo" width="120" />
</p>

## Download

**[⬇️ Download pgmac for macOS (Apple Silicon)](https://github.com/solo29/pgmac/raw/main/release/pgmac_0.1.0_aarch64.dmg)**

> Version 0.1.0 • Requires macOS on Apple Silicon (M1/M2/M3)

---

## Features

- **🔌 Connection Management** — Save and manage multiple PostgreSQL connections
- **✏️ SQL Editor** — Monaco-powered editor with syntax highlighting and auto-completion
- **⚡ Quick Execution** — Run queries with `Ctrl/Cmd + Enter`
- **📊 Results Table** — View query results in a fast, virtualized table
- **🗂️ Database Browser** — Navigate schemas, tables, and columns in the sidebar
- **✏️ Inline Editing** — Edit cell values directly in the results table
- **🗑️ Row Deletion** — Delete rows with confirmation modal and auto-generated SQL
- **📑 Multi-Tab Workspace** — Work with multiple queries in separate tabs
- **🌙 Dark Mode** — Native dark mode support

---

## Tech Stack

| Layer    | Technology                                               |
| -------- | -------------------------------------------------------- |
| Backend  | Rust + [Tauri 2](https://tauri.app)                      |
| Database | [SQLx](https://github.com/launchbadge/sqlx) (PostgreSQL) |
| Frontend | React 19 + TypeScript                                    |
| Editor   | Monaco Editor                                            |
| Styling  | Tailwind CSS 4                                           |
| State    | Zustand + React Query                                    |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- Xcode Command Line Tools

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/pgmac.git
cd pgmac

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

---

## License

MIT
