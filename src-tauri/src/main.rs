//! NATS Workbench 入口点。
//!
//! 初始化环境日志（`env_logger`），然后启动 Tauri 应用。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 启动日志并委托给 lib 的 `run()` 启动 Tauri 运行时。
fn main() {
    env_logger::init();
    log::info!("NATS Workbench starting...");
    nats_workbench_lib::run()
}
