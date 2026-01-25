use async_trait::async_trait;
use crate::models::{DbConfig, QueryResult, ColumnDefinition};

pub mod postgres;

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    async fn connect(&mut self, config: &DbConfig) -> Result<(), String>;
    async fn query(&self, sql: &str) -> Result<QueryResult, String>;
    async fn get_schemas(&self) -> Result<Vec<String>, String>;
    async fn get_tables(&self, schema: &str) -> Result<Vec<String>, String>;
    async fn get_columns(&self, schema: &str, table: &str) -> Result<Vec<ColumnDefinition>, String>;
    async fn ping(&self) -> Result<(), String>;
    async fn update_cell(
        &self, 
        schema: &str, 
        table: &str, 
        col_name: &str, 
        col_type: Option<String>,
        new_value: Option<String>, 
        row_identifiers: Vec<(String, Option<String>, String)>
    ) -> Result<u64, String>;
}
