//! 持久化到Tauri存储的连接配置类型。

use serde::{Deserialize, Serialize};

/// 完整连接配置文件：服务器、认证和调优选项。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub label: String,
    pub servers: Vec<String>,
    pub auth: AuthMethod,
    #[serde(default)]
    pub options: ConnectionOptions,
}

/// 支持的NATS认证机制。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthMethod {
    None,
    Token {
        token: String,
    },
    UserPassword {
        username: String,
        password: String,
    },
    NKey {
        nkey_seed: String,
    },
    Jwt {
        jwt: String,
        nkey_seed: String,
    },
    Tls {
        ca_cert_path: Option<String>,
        client_cert_path: String,
        client_key_path: String,
    },
}

/// 可调连接参数（重连、超时、回显等）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionOptions {
    #[serde(default = "default_max_reconnects")]
    pub max_reconnects: Option<u32>,
    pub reconnect_delay_ms: Option<u64>,
    pub connection_timeout_ms: Option<u64>,
    pub name: Option<String>,
    pub inbox_prefix: Option<String>,
    #[serde(default)]
    pub retry_on_failed_connect: bool,
    #[serde(default)]
    pub echo: bool,
    #[serde(default)]
    pub verbose: bool,
}

impl Default for ConnectionOptions {
    fn default() -> Self {
        Self {
            max_reconnects: Some(10),
            reconnect_delay_ms: Some(1000),
            connection_timeout_ms: Some(5000),
            name: None,
            inbox_prefix: None,
            retry_on_failed_connect: true,
            echo: true,
            verbose: false,
        }
    }
}

fn default_max_reconnects() -> Option<u32> {
    Some(10)
}

/// 通过事件发送到前端的实时连接遥测数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub id: String,
    pub label: String,
    pub state: String,
    pub rtt_ms: f64,
    pub server_addr: String,
    pub server_version: String,
    pub msgs_in_per_sec: f64,
    pub msgs_out_per_sec: f64,
    pub bytes_in_per_sec: f64,
    pub bytes_out_per_sec: f64,
    pub reconnect_count: u32,
    pub uptime_secs: u64,
    pub subscriptions_count: u64,
}

impl Default for ConnectionStatus {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            state: "disconnected".to_string(),
            rtt_ms: 0.0,
            server_addr: String::new(),
            server_version: String::new(),
            msgs_in_per_sec: 0.0,
            msgs_out_per_sec: 0.0,
            bytes_in_per_sec: 0.0,
            bytes_out_per_sec: 0.0,
            reconnect_count: 0,
            uptime_secs: 0,
            subscriptions_count: 0,
        }
    }
}
