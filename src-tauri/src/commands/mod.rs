use tauri::{State, AppHandle};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::{DbConfig, QueryResult};
use crate::state::AppState;
use crate::db::postgres::PostgresDriver;
use crate::db::DatabaseDriver;

#[tauri::command]
pub async fn connect_db(
    state: State<'_, AppState>,
    config: DbConfig,
) -> Result<String, String> {
    // For MVP, strictly Postgres
    let mut driver = PostgresDriver::new();
    driver.connect(&config).await?;

    let connection_id = Uuid::new_v4().to_string();
    
    let mut registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
    registry.insert(connection_id.clone(), Arc::new(driver));

    Ok(connection_id)
}

#[tauri::command]
pub async fn run_query(
    state: State<'_, AppState>,
    connection_id: String,
    query: String,
) -> Result<QueryResult, String> {
    let driver = {
        let registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
        let driver = registry.get(&connection_id).ok_or("Connection not found")?;
        driver.clone()
    };

    driver.query(&query).await
}

#[tauri::command]
pub async fn get_schemas(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
     let driver = {
        let registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
        let driver = registry.get(&connection_id).ok_or("Connection not found")?;
        driver.clone()
    };
    driver.get_schemas().await
}

#[tauri::command]
pub async fn get_tables(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
) -> Result<Vec<String>, String> {
     let driver = {
        let registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
        let driver = registry.get(&connection_id).ok_or("Connection not found")?;
        driver.clone()
    };
    driver.get_tables(&schema).await
}

#[tauri::command]
pub async fn get_columns(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<crate::models::ColumnDefinition>, String> {
     let driver = {
        let registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
        let driver = registry.get(&connection_id).ok_or("Connection not found")?;
        driver.clone()
    };
    driver.get_columns(&schema, &table).await
}

use crate::models::{SavedConnection};
use crate::storage;

#[tauri::command]
pub async fn save_connection(
    app: AppHandle,
    connection: SavedConnection,
) -> Result<(), String> {
    storage::add_connection(&app, connection)
}

#[tauri::command]
pub async fn load_connections(
    app: AppHandle,
) -> Result<Vec<SavedConnection>, String> {
    storage::load_connections(&app)
}

#[tauri::command]
pub async fn delete_connection(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    storage::delete_connection(&app, &id)
}

#[tauri::command]
pub async fn disconnect_db(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), String> {
    let mut registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
    registry.remove(&connection_id);
    Ok(())
}

use crate::storage::Session;

#[tauri::command]
pub async fn save_session(
    app: AppHandle,
    session: Session,
) -> Result<(), String> {
    storage::save_session(&app, session)
}

#[tauri::command]
pub async fn load_session(
    app: AppHandle,
) -> Result<Session, String> {
    storage::load_session(&app)
}

#[tauri::command]
pub async fn update_cell(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
    column: String,
    col_type: Option<String>,
    new_value: Option<String>,
    row_identifiers: Vec<(String, Option<String>, String)>
) -> Result<u64, String> {
    let driver = {
        let registry = state.registry.connections.lock().map_err(|e| e.to_string())?;
        let driver = registry.get(&connection_id).ok_or("Connection not found")?;
        driver.clone()
    };
    driver.update_cell(&schema, &table, &column, col_type, new_value, row_identifiers).await
}
