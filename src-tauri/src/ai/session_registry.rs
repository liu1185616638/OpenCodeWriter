/// AiSessionRegistry — tracks active AI sessions for real cancellation.
///
/// Each session registers an `Arc<AtomicBool>` cancellation flag.
/// `cancel_ai_session` sets the flag to true; the streaming loop in
/// `AiTaskService::execute_inner` checks it before processing each delta.
/// Sessions are removed when the task completes (success, error, or cancel).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub struct AiSessionRegistry {
    sessions: Mutex<HashMap<String, std::sync::Arc<AtomicBool>>>,
}

impl AiSessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new session and return its cancellation flag.
    pub fn register(&self, session_id: &str) -> std::sync::Arc<AtomicBool> {
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        let mut map = self.sessions.lock().expect("session registry poisoned");
        map.insert(session_id.to_string(), flag.clone());
        flag
    }

    /// Signal cancellation for a session. Returns true if the session existed.
    pub fn cancel(&self, session_id: &str) -> bool {
        let map = self.sessions.lock().expect("session registry poisoned");
        if let Some(flag) = map.get(session_id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    /// Remove a session from the registry (called when task ends).
    pub fn unregister(&self, session_id: &str) {
        let mut map = self.sessions.lock().expect("session registry poisoned");
        map.remove(session_id);
    }
}

impl Default for AiSessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}
