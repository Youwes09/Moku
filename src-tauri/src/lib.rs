mod commands;
mod server;

use std::sync::Mutex;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_shell::process::CommandChild;

pub struct ServerState(pub Mutex<Option<CommandChild>>);

const IPC_PORT: u16 = 47823;
const HANDSHAKE: &[u8] = b"MOKU:1\n";
const FOCUS_CMD: &[u8] = b"focus\n";

fn do_quit(app: &tauri::AppHandle) {
    server::kill_tachidesk(app);
    app.exit(0);
}

fn start_instance_listener(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(("127.0.0.1", IPC_PORT)) else {
            return;
        };
        for stream in listener.incoming().flatten() {
            handle_ipc_connection(stream, &app);
        }
    });
}

fn handle_ipc_connection(mut stream: TcpStream, app: &tauri::AppHandle) {
    let mut buf = [0u8; 32];
    let Ok(n) = stream.read(&mut buf) else { return };
    let msg = &buf[..n];

    if !msg.starts_with(HANDSHAKE) {
        return;
    }

    let cmd = &msg[HANDSHAKE.len()..];
    if cmd.starts_with(b"focus") {
        let _ = stream.write_all(b"ok\n");
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

fn signal_existing_instance() -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", IPC_PORT)) else {
        return false;
    };
    stream.set_read_timeout(Some(std::time::Duration::from_millis(500))).ok();

    let mut msg = Vec::new();
    msg.extend_from_slice(HANDSHAKE);
    msg.extend_from_slice(FOCUS_CMD);

    if stream.write_all(&msg).is_err() {
        return false;
    }

    let mut resp = [0u8; 4];
    matches!(stream.read(&mut resp), Ok(n) if resp[..n].starts_with(b"ok"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if signal_existing_instance() {
        std::process::exit(0);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_discord_rpc::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::storage::get_storage_info,
            commands::storage::get_default_downloads_path,
            commands::storage::check_path_exists,
            commands::storage::create_directory,
            commands::storage::migrate_downloads,
            commands::server::spawn_server,
            commands::server::kill_server,
            commands::system::get_platform_ui_scale,
            commands::system::restart_app,
            commands::system::exit_app,
            commands::system::clear_moku_cache,
            commands::system::clear_suwayomi_cache,
            commands::system::reset_suwayomi_data,
            commands::system::open_path,
            commands::system::pick_downloads_folder,
            commands::backup::export_app_data,
            commands::backup::import_app_data,
            commands::backup::auto_backup_app_data,
            commands::backup::get_auto_backup_dir,
            commands::backup::read_store_files,
            commands::updater::list_releases,
            commands::updater::download_and_install_update,
            commands::biometric::windows_hello_authenticate,
            commands::biometric::windows_hello_available,
        ])
        .setup(|app| {
            start_instance_listener(app.handle().clone());

            let show = MenuItem::with_id(app, "show", "Show Moku", true, None::<&str>)?;
            let sep  = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Moku", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Moku")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => do_quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                server::kill_tachidesk(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running moku");
}