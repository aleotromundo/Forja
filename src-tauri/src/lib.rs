use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn open_forja(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("https://forja.app/", None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_forja])
        .run(tauri::generate_context!())
        .expect("error while running Forja");
}
