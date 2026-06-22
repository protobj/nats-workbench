//! 由Tauri命令返回的应用级错误类型。

use serde::Serialize;
use tauri::ipc::InvokeError;

/// 所有Tauri命令失败的统一错误类型。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// 建立或维持NATS连接失败。
    #[error("Connection error: {0}")]
    Connection(String),
    /// 引用的连接在应用状态中不存在。
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),
    /// 配置加载或保存失败。
    #[error("Config error: {0}")]
    Config(String),
    /// 认证方法设置失败。
    #[error("Auth error: {0}")]
    Auth(String),
    /// 文件或网络I/O错误。
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    /// async_nats客户端的通用错误。
    #[error("NATS error: {0}")]
    Nats(String),
    /// 意外的内部失败的兜底错误。
    #[error("Internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Internal(s)
    }
}

impl AppError {
    /// 将此错误转换为用于IPC响应的Tauri `InvokeError`。
    pub fn into_invoke_error(self) -> InvokeError {
        InvokeError::from(self.to_string())
    }
}
