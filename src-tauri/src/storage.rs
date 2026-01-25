use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::models::SavedConnection;
use serde::{Deserialize, Serialize};

const FILE_NAME: &str = "connections.json";

fn get_connections_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(FILE_NAME);
    Ok(path)
}

pub fn load_connections(app: &AppHandle) -> Result<Vec<SavedConnection>, String> {
    let path = get_connections_path(app)?;
    
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let connections: Vec<SavedConnection> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(connections)
}

pub fn save_connections(app: &AppHandle, connections: &[SavedConnection]) -> Result<(), String> {
    let path = get_connections_path(app)?;
    let content = serde_json::to_string_pretty(connections).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_connection(app: &AppHandle, connection: SavedConnection) -> Result<(), String> {
    let mut connections = load_connections(app)?;
    // Replace if exists (by id) or add
    if let Some(pos) = connections.iter().position(|c| c.id == connection.id) {
        connections[pos] = connection;
    } else {
        connections.push(connection);
    }
    save_connections(app, &connections)
}

pub fn delete_connection(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut connections = load_connections(app)?;
    connections.retain(|c| c.id != id);
    save_connections(app, &connections)
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TabState {
    pub id: String,
    pub title: String,
    pub sql: String,
    pub connection_id: Option<String>,
    pub saved_connection_id: Option<String>,
    pub db_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Session {
    pub last_connection_id: Option<String>,
    pub last_saved_connection_id: Option<String>,
    pub last_table: Option<String>,
    pub last_query: Option<String>,
    pub tabs: Option<Vec<TabState>>,
    pub active_tab_id: Option<String>,
}

const SESSION_FILE_NAME: &str = "session.json";

fn get_session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(SESSION_FILE_NAME);
    Ok(path)
}

pub fn load_session(app: &AppHandle) -> Result<Session, String> {
    let path = get_session_path(app)?;
    if !path.exists() {
        return Ok(Session::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let session: Session = serde_json::from_str(&content).unwrap_or_default();
    Ok(session)
}

pub fn save_session(app: &AppHandle, session: Session) -> Result<(), String> {
    let path = get_session_path(app)?;
    let content = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
