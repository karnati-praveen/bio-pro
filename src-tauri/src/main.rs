#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env, fs,
    path::PathBuf,
    process,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Manager;

// ── Windows Job Object ────────────────────────────────────────────────────────
// Attaches `pid` to a new Job Object with KILL_ON_JOB_CLOSE so the backend is
// terminated by the OS whenever the Tauri process exits — including hard crashes.
#[cfg(windows)]
fn tie_child_to_process(pid: u32) {
    use std::ptr;
    use windows::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{OpenProcess, PROCESS_ALL_ACCESS},
        },
    };

    unsafe {
        let job: HANDLE = match CreateJobObjectW(None, None) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("[bio-pro] CreateJobObjectW: {e}");
                return;
            }
        };

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        match SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            ptr::addr_of!(info) as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) {
            Ok(()) => {}
            Err(e) => {
                eprintln!("[bio-pro] SetInformationJobObject: {e}");
                return;
            }
        }

        let proc: HANDLE = match OpenProcess(PROCESS_ALL_ACCESS, false, pid) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("[bio-pro] OpenProcess: {e}");
                return;
            }
        };

        match AssignProcessToJobObject(job, proc) {
            Ok(()) => {}
            Err(e) => {
                eprintln!("[bio-pro] AssignProcessToJobObject: {e}");
            }
        }
        CloseHandle(proc).ok();

        // Keep the job handle open for the process lifetime. The OS closes it
        // (and kills every process in the job) when Tauri exits for any reason.
        std::mem::forget(job);
    }
}

#[cfg(not(windows))]
fn tie_child_to_process(_pid: u32) {}

// ─────────────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window missing");
            let res_dir = app.path().resource_dir()?;

            let appdata = env::var("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| dirs::home_dir().expect("cannot locate home dir"));
            let db_dir = appdata.join("bio-pro");
            fs::create_dir_all(&db_dir)?;
            let db_path = db_dir.join("designs.db");

            let backend_exe = res_dir
                .join("backend-server")
                .join("backend-server.exe");

            let window_clone = window.clone();
            thread::spawn(move || {
                let child = match process::Command::new(&backend_exe)
                    .env("DESIGNS_DB", db_path.to_str().unwrap_or_default())
                    .spawn()
                {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("[bio-pro] failed to launch backend: {e}");
                        window_clone.show().ok();
                        return;
                    }
                };

                tie_child_to_process(child.id());

                let child = Arc::new(Mutex::new(child));

                let ready = (0..60).any(|_| {
                    thread::sleep(Duration::from_millis(500));
                    reqwest::blocking::get("http://127.0.0.1:8000/api/health")
                        .map(|r| r.status().is_success())
                        .unwrap_or(false)
                });

                if !ready {
                    eprintln!("[bio-pro] backend did not become healthy within 30 s");
                }

                window_clone.show().ok();

                let child_for_evt = Arc::clone(&child);
                window_clone.on_window_event(move |evt| {
                    if matches!(evt, tauri::WindowEvent::Destroyed) {
                        child_for_evt.lock().unwrap().kill().ok();
                    }
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri runtime error");
}
