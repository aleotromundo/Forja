use std::path::PathBuf;
use std::process::{Child, Command};
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

const FORJA_URL: &str = "https://forjah.vercel.app/";

struct AgentProcess(Mutex<Option<Child>>);

#[tauri::command]
fn start_forja(app: tauri::AppHandle, state: tauri::State<'_, AgentProcess>) -> Result<String, String> {
    let root = rfd::FileDialog::new()
        .set_title("Elegí la carpeta del proyecto para Forja")
        .pick_folder()
        .ok_or_else(|| "No se eligió ninguna carpeta.".to_string())?;
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let script = agent_script(&app)?;
    let node = if cfg!(windows) { "node.exe" } else { "node" };
    let mut child = Command::new(node)
        .arg(script)
        .arg("--root")
        .arg(&root)
        .arg("--token")
        .arg(&token)
        .spawn()
        .map_err(|error| format!("No se pudo iniciar el agente local: {error}"))?;
    wait_for_agent(&mut child)?;
    *state.0.lock().map_err(|_| "No se pudo guardar el agente local.".to_string())? = Some(child);
    app.opener()
        .open_url(format!("{FORJA_URL}#agentToken={token}"), None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(root.display().to_string())
}

fn wait_for_agent(child: &mut Child) -> Result<(), String> {
    let address: SocketAddr = "127.0.0.1:7878".parse().expect("valid agent address");
    for _ in 0..40 {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("No se pudo comprobar el agente local: {error}"))?
        {
            return Err(format!("El agente local terminó inesperadamente: {status}"));
        }
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("El agente local no empezó a escuchar en el puerto 7878.".to_string())
}

fn agent_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(r"..\agent\forja-agent.mjs"));
    }
    app.path()
        .resource_dir()
        .map(|dir| dir.join("forja-agent.mjs"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_forja(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(FORJA_URL, None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AgentProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![open_forja, start_forja])
        .run(tauri::generate_context!())
        .expect("error while running Forja");
}
