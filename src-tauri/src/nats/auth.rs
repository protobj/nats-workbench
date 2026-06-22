//! 从`ConnectionConfig`构建async_nats的`ConnectOptions`。

use crate::error::AppError;
use crate::nats::config::{AuthMethod, ConnectionConfig};
use async_nats::ConnectOptions;
use async_nats::AuthError;
use std::path::PathBuf;

/// 将`ConnectionConfig`转换为async_nats的`ConnectOptions`，应用认证、超时、重连和TLS。
pub fn build_connect_options(config: &ConnectionConfig) -> Result<ConnectOptions, AppError> {
    let mut options = ConnectOptions::new();

    if let Some(ref name) = config.options.name {
        options = options.name(name.clone());
    }

    if let Some(mr) = config.options.max_reconnects {
        options = options.max_reconnects(mr as usize);
    }

    if let Some(delay) = config.options.reconnect_delay_ms {
        options = options.reconnect_delay_callback(move |_reconnects| {
            std::time::Duration::from_millis(delay)
        });
    }

    if let Some(timeout) = config.options.connection_timeout_ms {
        options = options.connection_timeout(std::time::Duration::from_millis(timeout));
    }

    if let Some(ref prefix) = config.options.inbox_prefix {
        options = options.custom_inbox_prefix(prefix.clone());
    }

    if config.options.retry_on_failed_connect {
        options = options.retry_on_initial_connect();
    }

    if !config.options.echo {
        options = options.no_echo();
    }

    options = options.require_tls(false);

    match &config.auth {
        AuthMethod::None => {}
        AuthMethod::Token { token } => {
            options = options.token(token.clone());
        }
        AuthMethod::UserPassword { username, password } => {
            options = options.user_and_password(username.clone(), password.clone());
        }
        AuthMethod::NKey { nkey_seed } => {
            options = options.nkey(nkey_seed.clone());
        }
        AuthMethod::Jwt { jwt, nkey_seed } => {
            let seed = nkey_seed.clone();
            options = options.jwt(jwt.clone(), move |nonce| {
                let seed = seed.clone();
                async move {
                    let key_pair = nkeys::KeyPair::from_seed(&seed)
                        .map_err(|e| AuthError::new(format!("NKey error: {}", e)))?;
                    key_pair.sign(&nonce)
                        .map_err(|e| AuthError::new(format!("Sign error: {}", e)))
                }
            });
        }
        AuthMethod::Tls {
            ca_cert_path,
            client_cert_path,
            client_key_path,
        } => {
            if let Some(ref ca_path) = ca_cert_path {
                options = options.add_root_certificates(PathBuf::from(ca_path));
            }
            options = options.add_client_certificate(
                PathBuf::from(client_cert_path),
                PathBuf::from(client_key_path),
            );
            options = options.require_tls(true);
        }
    }

    Ok(options)
}
