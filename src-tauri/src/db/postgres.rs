use async_trait::async_trait;
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{Column, Row, TypeInfo};
use std::time::Duration;
use chrono::{DateTime, Utc, NaiveDateTime, NaiveDate};

use crate::db::DatabaseDriver;
use crate::models::{DbConfig, QueryResult};

pub struct PostgresDriver {
    pool: Option<sqlx::PgPool>,
}

impl PostgresDriver {
    pub fn new() -> Self {
        Self { pool: None }
    }
}

#[async_trait]
impl DatabaseDriver for PostgresDriver {
    async fn connect(&mut self, config: &DbConfig) -> Result<(), String> {
        let connection_string = format!(
            "postgres://{}:{}@{}:{}/{}",
            config.user,
            config.password.as_deref().unwrap_or(""),
            config.host,
            config.port,
            config.dbname
        );

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect(&connection_string)
            .await
            .map_err(|e| e.to_string())?;

        self.pool = Some(pool);
        Ok(())
    }

    async fn query(&self, sql: &str) -> Result<QueryResult, String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        use futures::StreamExt;
        use sqlx::Either;

        // Simple inference of query type
        let trimmed_sql = sql.trim();
        let query_type = trimmed_sql
            .split_whitespace()
            .next()
            .map(|s| s.to_uppercase())
            .unwrap_or_else(|| "UNKNOWN".to_string());

        let mut rows = Vec::new();
        let mut affected_rows = 0;
        let mut columns = Vec::new();

        let mut stream = sqlx::query(sql).fetch_many(pool);

        while let Some(result) = stream.next().await {
            match result.map_err(|e| e.to_string())? {
                Either::Left(res) => {
                    affected_rows += res.rows_affected();
                }
                Either::Right(row) => {
                    if columns.is_empty() {
                        columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                    }
                    
                    let mut row_values = Vec::new();
                    for (i, _) in row.columns().iter().enumerate() {
                         let value = map_postgres_value(&row, i);
                         row_values.push(value);
                    }
                    rows.push(row_values);
                }
            }
        }

        Ok(QueryResult {
            columns,
            rows,
            affected_rows,
            query_type,
        })
    }

    async fn get_schemas(&self) -> Result<Vec<String>, String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        let rows = sqlx::query(
            "SELECT schema_name FROM information_schema.schemata \
             WHERE schema_name NOT LIKE 'pg_%' \
             AND schema_name != 'information_schema' \
             ORDER BY schema_name"
        )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

        let schemas: Vec<String> = rows.iter().map(|row| row.get("schema_name")).collect();
        Ok(schemas)
    }

    async fn get_tables(&self, schema: &str) -> Result<Vec<String>, String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        let rows = sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name")
            .bind(schema)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

        let tables: Vec<String> = rows.iter().map(|row| row.get("table_name")).collect();
        Ok(tables)
    }

    async fn get_columns(&self, schema: &str, table: &str) -> Result<Vec<crate::models::ColumnDefinition>, String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        
        let sql = r#"
            SELECT 
                a.attname as column_name,
                format_type(a.atttypid, a.atttypmod) as data_type,
                EXISTS (
                    SELECT 1 FROM pg_index i
                    WHERE i.indrelid = c.oid 
                    AND a.attnum = ANY(i.indkey::int[])
                    AND i.indisprimary
                ) as is_pk,
                EXISTS (
                    SELECT 1 FROM pg_index i
                    WHERE i.indrelid = c.oid 
                    AND a.attnum = ANY(i.indkey::int[])
                    AND i.indisunique AND a.attnotnull
                ) as is_unique,
                (
                    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
                    FROM pg_enum e
                    WHERE e.enumtypid = t.oid
                ) as enum_values
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_type t ON a.atttypid = t.oid
            WHERE n.nspname = $1 AND c.relname = $2 
              AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum
        "#;

        let rows = sqlx::query(sql)
            .bind(schema)
            .bind(table)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

        let cols: Vec<crate::models::ColumnDefinition> = rows.iter().map(|row| {
             let name: String = row.get("column_name");
             let is_pk: bool = row.get("is_pk");
             let is_unique: bool = row.get("is_unique");
             let enum_values: Option<Vec<String>> = row.try_get("enum_values").ok();

             crate::models::ColumnDefinition {
                 name,
                 data_type: row.get("data_type"),
                 is_pk,
                 is_unique,
                 enum_values,
             }
        }).collect();
        
        Ok(cols)
    }

    async fn ping(&self) -> Result<(), String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        sqlx::query("SELECT 1")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn update_cell(
        &self, 
        schema: &str, 
        table: &str, 
        col_name: &str, 
        col_type: Option<String>,
        new_value: Option<String>, 
        row_identifiers: Vec<(String, Option<String>, String)>
    ) -> Result<u64, String> {
        let pool = self.pool.as_ref().ok_or("Not connected")?;
        
        // Construct SQL
        // UPDATE "schema"."table" SET "col" = $1::type WHERE ...
        
        let cast_str = col_type.as_deref().map(|t| format!("::{}", t)).unwrap_or_default();

        let mut sql = format!(
            r#"UPDATE "{}"."{}" SET "{}" = $1{} WHERE "#,
            schema, table, col_name, cast_str
        );
        
        let mut bind_index = 2; // $1 is new_value
        
        for (i, (col, val, dtype)) in row_identifiers.iter().enumerate() {
            if i > 0 {
                sql.push_str(" AND ");
            }
            
            if val.is_some() {
                // Cast usage: "col" = $N::type
                sql.push_str(&format!(r#""{}" = ${}::{}"#, col, bind_index, dtype));
                bind_index += 1;
            } else {
                sql.push_str(&format!(r#""{}" IS NULL"#, col));
            }
        }
        
        // Convert JSON array to Postgres array format if likely an array type
        let mut final_value = new_value;
        if let (Some(t), Some(v)) = (&col_type, &final_value) {
            if (t.starts_with('_') || t.ends_with("[]")) && v.trim().starts_with('[') {
                 if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str(v) {
                     let mut pg_arr = String::from("{");
                     for (i, elem) in arr.iter().enumerate() {
                         if i > 0 { pg_arr.push(','); }
                         match elem {
                             serde_json::Value::Null => pg_arr.push_str("NULL"),
                             serde_json::Value::String(s) => {
                                 pg_arr.push('"');
                                 // Escape " and \
                                 for c in s.chars() {
                                     if c == '"' || c == '\\' { pg_arr.push('\\'); }
                                     pg_arr.push(c);
                                 }
                                 pg_arr.push('"');
                             },
                             _ => pg_arr.push_str(&elem.to_string()),
                         }
                     }
                     pg_arr.push('}');
                     final_value = Some(pg_arr);
                 }
            }
        }
        
        let mut query = sqlx::query(&sql);
        
        // Bind new_value ($1)
        query = query.bind(final_value);
        
        // Bind WHERE parameters
        for (_, val, _) in &row_identifiers {
             if let Some(v) = val {
                 query = query.bind(v);
             }
        }
        
        let result = query.execute(pool).await.map_err(|e| e.to_string())?;
        Ok(result.rows_affected())
    }
}

fn map_postgres_value(row: &PgRow, index: usize) -> serde_json::Value {
    use sqlx::ValueRef;
    let value_ref = match row.try_get_raw(index) {
        Ok(v) => v,
        Err(_) => return serde_json::Value::Null,
    };
    
    if value_ref.is_null() {
        return serde_json::Value::Null;
    }

    let type_info = value_ref.type_info();
    let type_name = type_info.name();

    match type_name {
        "BOOL" => {
            let v: Option<bool> = row.try_get(index).ok();
            serde_json::json!(v)
        },
        "INT2" | "INT4" | "INT8" => {
            let v: Option<i64> = row.try_get(index).ok();
            serde_json::json!(v)
        },
        "FLOAT4" | "FLOAT8" => {
            let v: Option<f64> = row.try_get(index).ok();
            serde_json::json!(v)
        },
        "TEXT" | "VARCHAR" | "CHAR" | "NAME" | "BPCHAR" => {
             let v: Option<String> = row.try_get(index).ok();
             serde_json::json!(v)
        },
        "UUID" => {
             let v: Option<uuid::Uuid> = row.try_get(index).ok();
             serde_json::json!(v.map(|u| u.to_string()))
        },
        "TIMESTAMP" | "TIMESTAMPTZ" => {
             // Try reading as DateTime<Utc>
             let v: Option<DateTime<Utc>> = row.try_get(index).ok();
             if let Some(t) = v {
                 return serde_json::json!(t.to_string());
             }
             // Fallback to NaiveDateTime if timezone is missing
             let v: Option<NaiveDateTime> = row.try_get(index).ok();
             if let Some(t) = v {
                 serde_json::json!(t.to_string())
             } else {
                 serde_json::Value::Null
             }
        },
        "DATE" => {
             let v: Option<NaiveDate> = row.try_get(index).ok();
             if let Some(d) = v {
                 serde_json::json!(d.to_string())
             } else {
                 serde_json::Value::Null
             }
        },
        "MONEY" => {
             // Decode standard Postgres MONEY (64-bit integer cents) manually from raw bytes
             // to bypass SQLx strict type checking which often refuses MONEY -> i64.
             if let Ok(bytes) = value_ref.as_bytes() {
                 if bytes.len() == 8 {
                     let cents = i64::from_be_bytes(bytes.try_into().unwrap_or([0; 8]));
                     serde_json::Value::String(format!("${:.2}", cents as f64 / 100.0))
                 } else {
                     serde_json::Value::String(format!("Invalid money len: {}", bytes.len()))
                 }
             } else {
                 serde_json::Value::Null
             }
        },
        "NUMERIC" => {
             let v: Option<sqlx::types::BigDecimal> = row.try_get(index).ok();
             if let Some(d) = v {
                 serde_json::json!(d.to_string())
             } else {
                 serde_json::Value::Null
             }
        },
        "VARCHAR[]" | "TEXT[]" | "CHAR[]" | "_varchar" | "_text" | "_char" => {
             let v: Option<Vec<String>> = row.try_get(index).ok();
             serde_json::json!(v)
        },
        "INT2[]" | "INT4[]" | "INT8[]" | "_int2" | "_int4" | "_int8" => {
             // Handle diverse integer types by trying to read as i64 (widest)
             // Note: Vec<i64> might fail if underlying is Vec<i32>. 
             // SQLx is sometimes strict. We might need specific matches.
             // But for now let's try strict matching roughly.
             if type_name.contains("INT2") || type_name.contains("int2") {
                  let v: Option<Vec<i16>> = row.try_get(index).ok();
                  serde_json::json!(v)
             } else if type_name.contains("INT4") || type_name.contains("int4") {
                  let v: Option<Vec<i32>> = row.try_get(index).ok();
                  serde_json::json!(v)
             } else {
                  let v: Option<Vec<i64>> = row.try_get(index).ok();
                  serde_json::json!(v)
             }
        },
        "FLOAT4[]" | "FLOAT8[]" | "_float4" | "_float8" => {
             let v: Option<Vec<f64>> = row.try_get(index).ok();
             serde_json::json!(v)
        },
        "BOOL[]" | "_bool" => {
             let v: Option<Vec<bool>> = row.try_get(index).ok();
             serde_json::json!(v)
        },
        "JSON[]" | "JSONB[]" | "_json" | "_jsonb" => {
             let v: Option<Vec<serde_json::Value>> = row.try_get(index).ok();
             serde_json::json!(v)
        },
        "JSON" | "JSONB" => {
             let v: Option<serde_json::Value> = row.try_get(index).ok();
             v.unwrap_or(serde_json::Value::Null)
        },
        _ => {
            let v_str: Option<String> = row.try_get(index).ok();
            if let Some(s) = v_str {
                serde_json::Value::String(s)
            } else {
                 // Try to read as bytes from value_ref directly (bypassing type checks)
                 if let Ok(bytes) = value_ref.as_bytes() {
                     // Check if it looks like UTF-8
                     if let Ok(s) = std::str::from_utf8(bytes) {
                         return serde_json::Value::String(s.to_string());
                     }
                 }
                 serde_json::Value::String(format!("<{}>", type_name))
            }
        }
    }
}
