use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{Manager, Url};
use uuid::Uuid;

const FORJA_URL: &str = "https://forjah.vercel.app/";

struct AgentProcess(Mutex<Option<Child>>);
struct ProjectState(Mutex<Option<PathBuf>>);

const MAX_TREE: usize = 3000;
const MAX_READ: u64 = 300_000;
const MAX_DOWNLOAD: u64 = 20_000_000;

#[derive(Serialize)]
struct DesktopFile {
    path: String,
    size: u64,
    modified: String,
}

fn project_root(state: &tauri::State<'_, ProjectState>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|_| "No se pudo acceder al proyecto.".to_string())?
        .clone()
        .ok_or_else(|| "No hay una carpeta de proyecto seleccionada.".to_string())
}

fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || relative.contains('\0') {
        return Err("Ruta inválida.".to_string());
    }
    let path = Path::new(relative);
    if path.is_absolute() || relative.split(['/', '\\']).any(|part| part == "..") {
        return Err("Ruta fuera del proyecto.".to_string());
    }
    let full = root.join(path);
    if !full.starts_with(root) {
        return Err("Ruta fuera del proyecto.".to_string());
    }
    Ok(full)
}

fn walk_project(root: &Path, current: &Path, output: &mut Vec<DesktopFile>) -> Result<(), String> {
    if output.len() >= MAX_TREE {
        return Ok(());
    }
    let entries = fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries {
        if output.len() >= MAX_TREE {
            break;
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if matches!(name.as_str(), ".git" | "node_modules" | ".output" | "dist" | ".tanstack") {
            continue;
        }
        let path = entry.path();
        if entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            walk_project(root, &path, output)?;
        } else if path.is_file() {
            let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            output.push(DesktopFile {
                path: relative,
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs().to_string())
                    .unwrap_or_default(),
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_tree(state: tauri::State<'_, ProjectState>) -> Result<Vec<DesktopFile>, String> {
    let root = project_root(&state)?;
    let mut files = Vec::new();
    walk_project(&root, &root, &mut files)?;
    Ok(files)
}

#[tauri::command]
fn desktop_read(path: String, state: tauri::State<'_, ProjectState>) -> Result<String, String> {
    let full = safe_path(&project_root(&state)?, &path)?;
    let metadata = fs::metadata(&full).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_READ {
        return Err("El archivo es demasiado grande para leerlo completo.".to_string());
    }
    let bytes = fs::read(full).map_err(|error| error.to_string())?;
    if bytes.contains(&0) {
        return Err("No es un archivo de texto.".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "No es un archivo de texto.".to_string())
}

#[tauri::command]
fn desktop_write(path: String, content: String, state: tauri::State<'_, ProjectState>) -> Result<(), String> {
    if content.len() > (MAX_READ as usize) * 4 {
        return Err("Contenido demasiado grande.".to_string());
    }
    let full = safe_path(&project_root(&state)?, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(full, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_mkdir(path: String, state: tauri::State<'_, ProjectState>) -> Result<(), String> {
    fs::create_dir_all(safe_path(&project_root(&state)?, &path)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_delete(path: String, state: tauri::State<'_, ProjectState>) -> Result<(), String> {
    let full = safe_path(&project_root(&state)?, &path)?;
    if full == project_root(&state)? {
        return Err("No se puede borrar la carpeta del proyecto.".to_string());
    }
    fs::remove_dir_all(&full).or_else(|_| fs::remove_file(&full)).map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_move(path: String, to_path: String, state: tauri::State<'_, ProjectState>) -> Result<(), String> {
    let root = project_root(&state)?;
    let source = safe_path(&root, &path)?;
    let target = safe_path(&root, &to_path)?;
    if target.exists() {
        return Err("El destino ya existe.".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(source, target).map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_download(url: String, path: String, state: tauri::State<'_, ProjectState>) -> Result<DesktopFile, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "URL inválida.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Solo se permiten URLs HTTP o HTTPS.".to_string());
    }
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    if host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host == "::1" || host.starts_with("10.") || host.starts_with("192.168.") {
        return Err("No se permiten destinos locales o privados.".to_string());
    }
    let root = project_root(&state)?;
    let full = safe_path(&root, &path)?;
    let response = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| error.to_string())?
        .get(parsed)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("La descarga respondió {}.", response.status()));
    }
    if response.content_length().unwrap_or(0) > MAX_DOWNLOAD {
        return Err("El archivo supera el límite de 20 MB.".to_string());
    }
    let bytes = response.bytes().map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_DOWNLOAD {
        return Err("El archivo supera el límite de 20 MB.".to_string());
    }
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&full, &bytes).map_err(|error| error.to_string())?;
    Ok(DesktopFile { path, size: bytes.len() as u64, modified: String::new() })
}

#[tauri::command]
fn start_forja(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentProcess>,
    project: tauri::State<'_, ProjectState>,
) -> Result<String, String> {
    let root = rfd::FileDialog::new()
        .set_title("Elegí la carpeta del proyecto para Forja")
        .pick_folder()
        .ok_or_else(|| "No se eligió ninguna carpeta.".to_string())?;
    *project.0.lock().map_err(|_| "No se pudo guardar el proyecto.".to_string())? = Some(root.clone());
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let project_name = root.file_name().and_then(|name| name.to_str()).unwrap_or_default();
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
    navigate_forja(
        &app,
        &format!(
            "{FORJA_URL}?desktop=1#agentToken={token}&projectName={}",
            urlencoding::encode(project_name)
        ),
    )?;
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
    navigate_forja(&app, &format!("{FORJA_URL}?desktop=1"))
}

fn navigate_forja(app: &tauri::AppHandle, url: &str) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "No se encontró la ventana principal de Forja.".to_string())?;
    window
        .navigate(Url::parse(url).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AgentProcess(Mutex::new(None)))
        .manage(ProjectState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            open_forja,
            start_forja,
            desktop_tree,
            desktop_read,
            desktop_write,
            desktop_mkdir,
            desktop_delete,
            desktop_move,
            desktop_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forja");
}
