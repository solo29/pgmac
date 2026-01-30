mod db;
mod models;
mod state;
mod commands;
mod storage;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::connect_db,
            commands::disconnect_db,
            commands::run_query,
            commands::get_schemas,
            commands::get_tables,
            commands::save_connection,
            commands::load_connections,
            commands::delete_connection,
            commands::save_session,
            commands::save_session,
            commands::load_session,
            commands::update_cell,
            commands::get_columns,
            commands::update_connections_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
