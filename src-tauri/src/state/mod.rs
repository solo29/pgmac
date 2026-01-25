use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::db::DatabaseDriver;

pub struct ConnectionRegistry {
    pub connections: Mutex<HashMap<String, Arc<dyn DatabaseDriver>>>,
}

impl ConnectionRegistry {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }
}

pub struct AppState {
    pub registry: ConnectionRegistry,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            registry: ConnectionRegistry::new(),
        }
    }
}
