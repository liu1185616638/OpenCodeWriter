/// AiSessionRegistry — tracks active AI sessions and provides wakeable cancellation.
///
/// A plain AtomicBool can only be observed after the currently awaited future
/// returns. SessionCancellation combines an atomic terminal flag with Notify so
/// `tokio::select!` can wake immediately while waiting for Runtime startup or the
/// next stream item.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

pub struct SessionCancellation {
    cancelled: AtomicBool,
    notify: Notify,
}

impl SessionCancellation {
    fn new() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        if !self.cancelled.swap(true, Ordering::SeqCst) {
            self.notify.notify_waiters();
        }
    }

    /// Resolves as soon as cancellation is requested. The second flag check
    /// prevents a notification between the first check and future creation from
    /// being missed.
    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }

        let notified = self.notify.notified();
        if self.is_cancelled() {
            return;
        }

        notified.await;
    }
}

pub struct AiSessionRegistry {
    sessions: Mutex<HashMap<String, Arc<SessionCancellation>>>,
}

impl AiSessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, session_id: &str) -> Arc<SessionCancellation> {
        let cancellation = Arc::new(SessionCancellation::new());
        let mut map = self.sessions.lock().expect("session registry poisoned");
        map.insert(session_id.to_string(), cancellation.clone());
        cancellation
    }

    /// Signal cancellation for a session. Returns true if the session existed.
    pub fn cancel(&self, session_id: &str) -> bool {
        let map = self.sessions.lock().expect("session registry poisoned");
        if let Some(cancellation) = map.get(session_id) {
            cancellation.cancel();
            true
        } else {
            false
        }
    }

    pub fn is_cancelled(&self, session_id: &str) -> bool {
        let map = self.sessions.lock().expect("session registry poisoned");
        map.get(session_id)
            .map(|cancellation| cancellation.is_cancelled())
            .unwrap_or(false)
    }

    /// Remove a session from the registry after both Runtime and any apply phase
    /// have reached a terminal state.
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
