mod commands;
mod db;
mod models;
mod ai;
mod resources;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_db(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::delete_project,
            commands::projects::update_project_stage,
            // Outlines
            commands::outlines::get_outline,
            commands::outlines::save_outline,
            commands::outlines::complete_outline,
            // Characters
            commands::characters::list_characters,
            commands::characters::list_characters_by_tier,
            commands::characters::get_character,
            commands::characters::create_character,
            commands::characters::update_character,
            commands::characters::delete_character,
            // Chapters
            commands::chapters::list_chapters,
            commands::chapters::get_chapter,
            commands::chapters::create_chapter,
            commands::chapters::update_chapter,
            commands::chapters::delete_chapter,
            commands::chapters::reorder_chapters,
            // Contents
            commands::contents::get_content,
            commands::contents::save_content,
            commands::contents::mark_content_stale,
            commands::contents::list_stale_contents,
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::list_model_presets,
            commands::settings::create_model_preset,
            commands::settings::update_model_preset,
            commands::settings::delete_model_preset,
            commands::settings::fetch_models,
            // Stale
            commands::stale::mark_stale,
            commands::stale::is_stale,
            commands::stale::clear_stale,
            // Style
            commands::style::get_style_config,
            commands::style::save_style_config,
            commands::style::copy_style_config,
            // AI Generation
            commands::ai::generate_outline,
            commands::ai::generate_characters,
            commands::ai::generate_chapters,
            commands::ai::generate_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
