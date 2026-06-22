//! NATS GUI Tauri应用的二进制入口点。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 委托给`nats_gui_lib::run()`启动Tauri运行时。
fn main() {
    nats_workbench_lib::run()
}
