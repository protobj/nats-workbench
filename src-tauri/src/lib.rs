//! 库根模块：组装Tauri插件、命令和应用状态。

mod error;
mod state;
mod nats;
mod commands;

use state::AppState;
use tauri::Manager;

/// 构建并启动Tauri应用，包含所有插件和命令处理程序。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 用于配置和偏好的持久化键值存储。
        .plugin(tauri_plugin_store::Builder::default().build())
        // 原生文件打开/保存对话框。
        .plugin(tauri_plugin_dialog::init())
        // 系统通知支持。
        .plugin(tauri_plugin_notification::init())
        // Shell/进程生成。
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            app.manage(AppState::new(app_handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // -- 连接管理 --
            commands::connection_cmd::list_configs,
            commands::connection_cmd::save_config,
            commands::connection_cmd::delete_config,
            commands::connection_cmd::export_config,
            commands::connection_cmd::import_config,
            commands::connection_cmd::connect,
            commands::connection_cmd::disconnect,
            commands::connection_cmd::get_status,
            commands::connection_cmd::list_active_connections,
            commands::connection_cmd::test_connection,
            // -- 主题发布/订阅 --
            commands::topic_cmd::subscribe,
            commands::topic_cmd::unsubscribe,
            commands::topic_cmd::publish,
            commands::topic_cmd::send_request,
            commands::topic_cmd::publish_with_headers,
            commands::topic_cmd::discover_subjects,
            // -- 服务器监控 --
            commands::monitor_cmd::fetch_server_stats,
            commands::monitor_cmd::fetch_slow_consumers,
            commands::monitor_cmd::fetch_jetstream_summary,
            // -- JetStream流和消费者 --
            commands::jetstream_cmd::list_streams,
            commands::jetstream_cmd::create_stream,
            commands::jetstream_cmd::delete_stream,
            commands::jetstream_cmd::purge_stream,
            commands::jetstream_cmd::stream_messages,
            commands::jetstream_cmd::delete_stream_message,
            commands::jetstream_cmd::list_consumers,
            commands::jetstream_cmd::create_consumer,
            commands::jetstream_cmd::delete_consumer,
            commands::jetstream_cmd::update_stream,
            commands::jetstream_cmd::direct_get_message,
            commands::jetstream_cmd::pause_consumer,
            commands::jetstream_cmd::resume_consumer,
            commands::jetstream_cmd::reset_consumer,
            commands::jetstream_cmd::get_stream_subjects,
            // -- 基准测试和回放 --
            commands::game_cmd::discover_room_topics,
            commands::game_cmd::run_benchmark,
            commands::game_cmd::replay_stream_messages,
            // -- 键值存储 --
            commands::kv_cmd::list_kv_stores,
            commands::kv_cmd::kv_get_keys,
            commands::kv_cmd::kv_get,
            commands::kv_cmd::kv_put,
            commands::kv_cmd::kv_delete,
            commands::kv_cmd::kv_watch,
            commands::kv_cmd::kv_entry,
            commands::kv_cmd::kv_history,
            commands::kv_cmd::create_kv_store,
            commands::kv_cmd::delete_kv_store,
            // -- 对象存储 --
            commands::object_cmd::list_object_stores,
            commands::object_cmd::list_objects,
            commands::object_cmd::obj_get,
            commands::object_cmd::obj_put,
            commands::object_cmd::obj_delete,
            commands::object_cmd::obj_info,
            commands::object_cmd::obj_seal,
            commands::object_cmd::obj_update_metadata,
            commands::object_cmd::create_object_store,
            commands::object_cmd::delete_object_store,
            // -- 连接诊断和详细信息 --
            commands::connection_info_cmd::fetch_server_info,
            commands::connection_info_cmd::fetch_client_statistics,
            commands::connection_info_cmd::fetch_connection_state,
            commands::connection_info_cmd::get_max_payload,
            commands::connection_info_cmd::flush_connection,
            commands::connection_info_cmd::drain_connection,
            commands::connection_info_cmd::force_reconnect,
            commands::connection_info_cmd::query_account_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
