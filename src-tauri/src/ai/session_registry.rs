/// AiSessionRegistry — tracks active AI sessions and provides wakeable cancellation.
///
/// A Tokio watch channel is used instead of a passive atomic flag so callers can
/// `select!` cancellation against both runtime creation and stream reads. Dropping
/// the losing future aborts drop-safe HTTP/SDK requests immediately.

use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::watch;

pub struct AiSessionRegistry {
    sessions: Mutex<HashMap<String, watch::Sender<bool>>>,
}

impl AiSessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new session and return a receiver that can be awaited in select!.
    pub fn register(&self, session_id: &str) -> watch::Receiver<bool> {
        let (sender, receiver) = watch::channel(false);
        let mut map = self.sessions.lock().expect("session registry poisoned");
        map.insert(session_id.to_string(), sender);
        receiver
    }

    /// Signal cancellation for a session. Returns true if the session existed.
    pub fn cancel(&self, session_id: &str) -> bool {
        let map = self.sessions.lock().expect("session registry poisoned");
        map.get(session_id)
            .map(|sender| {
                let _ = sender.send(true);
                true
            })
            .unwrap_or(false)
    }

    /// Check cancellation before entering a database apply phase.
    pub fn is_cancelled(&self, session_id: &str) -> bool {
        let map = self.sessions.lock().expect("session registry poisoned");
        map.get(session_id)
            .map(|sender| *sender.borrow())
            .unwrap_or(false)
    }

    /// Remove a session from the registry when the complete command lifecycle ends.
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
