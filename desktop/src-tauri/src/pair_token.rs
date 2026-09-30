// The desktop app's extension_sync_tokens token, and handing it to the
// Wynko Focus Lock extension on the same PC so the extension is linked
// without a visit to the website.
//
// The webview (shared.js's autoConnectDesktop) has always called
// `get_token` / `save_token`, but neither command existed on this side, so
// get_token failed, the webview minted a brand-new 'Desktop app' token on
// every page load, and save_token failed too. Both live here now, persisted
// in their own store file.
//
// The extension picks the token up from GET /pair on the local heartbeat
// server (see heartbeat.rs). That route is only readable by an extension:
//   - it needs the custom header X-Wynko-Pair. A web page can only send a
//     custom header through a CORS preflight, and the preflight for /pair
//     never allows a web origin, so the browser never sends the request;
//   - a request carrying an Origin must be a chrome-extension:// origin,
//     and the response names that exact origin, never "*";
//   - the Host must be 127.0.0.1 / localhost, which stops DNS rebinding.
// Any extension ID is accepted because Edge gives sideloaded extensions
// its own ID (see browser_guard.rs's EXTENSION_ID). Another extension with
// localhost access could read this token, but such an extension can
// already read the signed-in wynko.in session itself, so this adds nothing.

use std::sync::Mutex;
use tauri_plugin_store::StoreExt;

pub const PAIR_STORE: &str = "wynko-pairing.json";
const TOKEN_KEY: &str = "sync_token";
const USER_KEY: &str = "sync_token_user";

#[derive(Clone, Default)]
pub struct StoredToken {
    pub token: String,
    // Account the token was minted for ("" when not known at save time).
    pub user_id: String,
}

pub struct PairToken(pub Mutex<Option<StoredToken>>);

impl PairToken {
    pub fn new() -> Self {
        PairToken(Mutex::new(None))
    }

    pub fn get(&self) -> Option<StoredToken> {
        self.0.lock().ok().and_then(|g| g.clone())
    }

    fn set(&self, value: Option<StoredToken>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = value;
        }
    }

    /// Called once from setup(): brings back the token saved on an earlier run.
    pub fn load(&self, app: &tauri::AppHandle) {
        if let Ok(store) = app.store(PAIR_STORE) {
            let token = store.get(TOKEN_KEY).and_then(|v| v.as_str().map(str::to_string));
            let user_id = store
                .get(USER_KEY)
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            if let Some(token) = token.filter(|t| !t.is_empty()) {
                self.set(Some(StoredToken { token, user_id }));
            }
        }
    }
}

fn current_user(auth: &crate::native_poll::AuthState) -> Option<String> {
    auth.0.lock().ok().and_then(|g| g.as_ref().map(|a| a.user_id.clone()))
}

/// The token to hand out, or None when there is none or it belongs to a
/// different account than the one signed in now.
pub fn token_for_current_user(pair: &PairToken, auth: &crate::native_poll::AuthState) -> Option<String> {
    let stored = pair.get()?;
    match current_user(auth) {
        Some(user) if !stored.user_id.is_empty() && stored.user_id != user => None,
        _ => Some(stored.token),
    }
}

#[tauri::command]
pub fn get_token(
    pair: tauri::State<std::sync::Arc<PairToken>>,
    auth: tauri::State<std::sync::Arc<crate::native_poll::AuthState>>,
) -> Result<String, String> {
    Ok(token_for_current_user(&pair, &auth).unwrap_or_default())
}

#[tauri::command]
pub fn save_token(
    app: tauri::AppHandle,
    pair: tauri::State<std::sync::Arc<PairToken>>,
    auth: tauri::State<std::sync::Arc<crate::native_poll::AuthState>>,
    token: String,
) -> Result<(), String> {
    let user_id = current_user(&auth).unwrap_or_default();
    let store = app.store(PAIR_STORE).map_err(|e| e.to_string())?;
    store.set(TOKEN_KEY, serde_json::json!(token));
    store.set(USER_KEY, serde_json::json!(user_id));
    store.save().map_err(|e| e.to_string())?;
    pair.set(if token.is_empty() { None } else { Some(StoredToken { token, user_id }) });
    Ok(())
}

/// Whether a request to GET /pair may be answered, and the Origin to echo
/// back when it may. `Some(None)` = allowed with no Origin (an extension
/// service worker with host permission can skip sending one).
pub fn check_pair_request(request: &tiny_http::Request) -> Option<Option<String>> {
    let header = |name: &str| {
        request
            .headers()
            .iter()
            .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
            .map(|h| h.value.as_str().to_string())
    };
    let host = header("Host").unwrap_or_default();
    let host_name = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(&host);
    if host_name != "127.0.0.1" && host_name != "localhost" {
        return None;
    }
    header("X-Wynko-Pair")?;
    match header("Origin") {
        None => Some(None),
        Some(origin) if is_extension_origin(&origin) => Some(Some(origin)),
        Some(_) => None,
    }
}

fn is_extension_origin(origin: &str) -> bool {
    let Some(id) = origin.strip_prefix("chrome-extension://") else { return false };
    id.len() == 32 && id.chars().all(|c| ('a'..='p').contains(&c))
}

#[cfg(test)]
mod tests {
    use super::{check_pair_request, is_extension_origin};
    use std::io::{Read, Write};

    // Sends one raw request to a throwaway tiny_http server and returns
    // what check_pair_request decided for it.
    fn decide(raw_headers: &str) -> Option<Option<String>> {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let raw = format!("GET /pair HTTP/1.1\r\n{raw_headers}Connection: close\r\n\r\n");
        let client = std::thread::spawn(move || {
            let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(raw.as_bytes()).unwrap();
            let mut out = String::new();
            let _ = s.read_to_string(&mut out);
        });
        let request = server.recv().unwrap();
        let decision = check_pair_request(&request);
        let _ = request.respond(tiny_http::Response::empty(204));
        client.join().unwrap();
        decision
    }

    const EXT: &str = "chrome-extension://knofmgookchmjekaefloaljcamjlbnmp";

    #[test]
    fn pair_request_rules() {
        // Extension, with or without an Origin.
        assert_eq!(
            decide(&format!("Host: 127.0.0.1:47552\r\nX-Wynko-Pair: 1\r\nOrigin: {EXT}\r\n")),
            Some(Some(EXT.to_string()))
        );
        assert_eq!(decide("Host: localhost:47552\r\nX-Wynko-Pair: 1\r\n"), Some(None));
        // A web page, a missing header, and DNS rebinding are refused.
        assert_eq!(decide("Host: 127.0.0.1:47552\r\nX-Wynko-Pair: 1\r\nOrigin: https://evil.example\r\n"), None);
        assert_eq!(decide(&format!("Host: 127.0.0.1:47552\r\nOrigin: {EXT}\r\n")), None);
        assert_eq!(decide("Host: evil.example:47552\r\nX-Wynko-Pair: 1\r\n"), None);
    }

    #[test]
    fn only_extension_origins() {
        assert!(is_extension_origin("chrome-extension://knofmgookchmjekaefloaljcamjlbnmp"));
        assert!(!is_extension_origin("https://wynko.in"));
        assert!(!is_extension_origin("chrome-extension://knofmgookchmjekaefloaljcamjlbnmp.evil"));
        assert!(!is_extension_origin("null"));
    }
}
