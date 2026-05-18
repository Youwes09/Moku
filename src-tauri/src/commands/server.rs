use crate::server::{self, resolve::suwayomi_data_dir, SpawnError};
use crate::ServerState;
use tauri::Manager;

#[tauri::command]
pub fn spawn_server(binary: String, web_ui_enabled: bool, app: tauri::AppHandle) -> Result<(), SpawnError> {
    {
        let state = app.state::<ServerState>();
        if state.0.lock().unwrap().is_some() {
            return Ok(());
        }
    }

    let data_dir = suwayomi_data_dir();
    let log_path = data_dir.join("moku-spawn.log");
    let _ = std::fs::create_dir_all(&data_dir);
    let mut log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();

    server::do_log(
        &mut log,
        &format!("[spawn_server] binary={:?} web_ui_enabled={} data_dir={:?}", binary, web_ui_enabled, data_dir),
    );

    server::conf::seed_server_conf(&data_dir, web_ui_enabled);

    let mut invocation =
        server::resolve::resolve_server_binary(&binary, &app, &mut log).map_err(|e| {
            server::do_log(&mut log, &format!("[spawn_server] resolve failed: {:?}", e));
            e
        })?;

    if invocation.bin.ends_with("java") || invocation.bin.ends_with("java.exe") {
        let rootdir_flag = format!(
            "-Dsuwayomi.tachidesk.config.server.rootDir={}",
            data_dir.to_string_lossy()
        );
        invocation.args.insert(0, rootdir_flag);
    }

    let working_dir = invocation
        .working_dir
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    server::do_log(
        &mut log,
        &format!(
            "[spawn_server] bin={:?} args={:?} cwd={:?}",
            invocation.bin, invocation.args, working_dir
        ),
    );

    use tauri_plugin_shell::ShellExt;
    let cmd = app
        .shell()
        .command(&invocation.bin)
        .env("JAVA_TOOL_OPTIONS", "-Djava.awt.headless=true")
        .args(&invocation.args)
        .current_dir(&working_dir);

    match cmd.spawn() {
        Ok((_rx, child)) => {
            *app.state::<ServerState>().0.lock().unwrap() = Some(child);
            Ok(())
        }
        Err(e) => {
            server::do_log(&mut log, &format!("[spawn_server] spawn failed: {}", e));
            Err(SpawnError::SpawnFailed(e.to_string()))
        }
    }
}

#[tauri::command]
pub fn kill_server(app: tauri::AppHandle) -> Result<(), String> {
    server::kill_tachidesk(&app);
    Ok(())
}