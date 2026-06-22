//! 发送到前端的线格式消息事件。

use base64::Engine;
use serde::{Deserialize, Serialize};

/// 解码后的NATS消息负载，包含用于二进制安全的base64编码，为UI序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatsMessageEvent {
    pub connection_id: String,
    pub subscription_id: String,
    pub subject: String,
    pub reply: Option<String>,
    pub payload: String,
    pub payload_bytes: String,
    pub timestamp: i64,
    pub size: usize,
}

impl NatsMessageEvent {
    /// 将原始`async_nats::Message`转换为前端安全的事件结构体。
    pub fn from_message(
        msg: async_nats::Message,
        connection_id: String,
        subscription_id: String,
    ) -> Self {
        let size = msg.payload.len();
        let payload_text = String::from_utf8_lossy(&msg.payload).to_string();
        let payload_b64 = base64::engine::general_purpose::STANDARD.encode(&msg.payload);
        let timestamp = chrono::Utc::now().timestamp_millis();

        Self {
            connection_id,
            subscription_id,
            subject: msg.subject.to_string(),
            reply: msg.reply.map(|s| s.to_string()),
            payload: payload_text,
            payload_bytes: payload_b64,
            timestamp,
            size,
        }
    }
}
