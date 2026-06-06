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
// The job handle is intentionally leaked; the OS reclaims it on process exit.
#[cfg(windows)]
fn tie_child_to_process(pid: u32) {
    use std::ptr;
    use windows::Win32::{
        Foundation::CloseHandle,
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
        let job = match CreateJobObjectW(None, None) {
            Ok(h) => h,
            Err(e) => { eprintln!("[bio-pro] CreateJobObjectW: {e}"); return; }
        };

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        if let Err(e) = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            ptr::addr_of!(info) as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) {
            eprintln!("[bio-pro] SetInformationJobObject: {e}");
            return;
        }

        let proc = match OpenProcess(PROCESS_ALL_ACCESS, false, pid) {
            Ok(h) => h,
            Err(e) => { eprintln!("[bio-pro] OpenProcess: {e}"); return; }
        };

        if let Err(e) = AssignProcessToJobObject(job, proc) {
            eprintln!("[bio-pro] AssignProcessToJobObject: {e}");
        }
        CloseHandle(proc).ok();

        // Keep the job handle open for the process lifetime.  The OS closes it
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

            // Resolve the user-writable database directory (%APPDATA%\bio-pro\).
            // Writing here never requires admin and never touches system paths.
            let appdata = env::var("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| dirs::home_dir().expect("cannot locate home dir"));
            let db_dir = appdata.join("bio-pro");
            fs::create_dir_all(&db_dir)?;
            let db_path = db_dir.join("designs.db");

            // The PyInstaller onedir bundle is placed next to Tauri's resources.
            let backend_exe = res_dir
                .join("backend-server")
                .join("backend-server.exe");

            let window_clone = window.clone();
            thread::spawn(move || {
                // Spawn the backend; env is inherited by default so PATH/TEMP/
                // SystemRoot are available for DLL resolution — only DESIGNS_DB
                // is overridden so the DB lands in the right user-writable location.
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

                // Tie the backend's lifetime to ours at the OS level.
                // If Tauri crashes the job handle is closed by the OS and the
                // backend is killed automatically — no zombie processes, no
                // locked DB files.
                tie_child_to_process(child.id());

                // Also keep a handle for the clean-exit path.
                let child = Arc::new(Mutex::new(child));

                // Poll /api/health up to 30 s (60 × 500 ms).
                let ready = (0..60).any(|_| {
                    thread::sleep(Duration::from_millis(500));
                    reqwest::blocking::get("http://127.0.0.1:8000/api/health")
                        .map(|r| r.status().is_success())
                        .unwrap_or(false)
                });

                if !ready {
                    eprintln!("[bio-pro] backend did not become healthy within 30 s");
                }

                // Show window whether ready or not — user sees the app.
                window_clone.show().ok();

                // Belt-and-suspenders: also kill on clean window close.
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
