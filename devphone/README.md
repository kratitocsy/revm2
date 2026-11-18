# devphone

A cloud Android phone that AI agents and people use together. Agents drive it through MCP tools
(screenshot, UI tree, tap by text, type, install APK, logcat). People watch it live in a browser or
in an editor's preview pane, and can take over with the mouse.

```
 agents (Claude Code, Cursor, CI) ──MCP──▶ devphone-mcp ─┐
                                                          ├─HTTPS─▶ gateway ──adb──▶ Android (redroid)
 people ──browser / preview pane──▶ relay (optional) ─────┘          (your server)
```

- **gateway/**: HTTP API, live screen stream and viewer page, next to the phone. Node 20+ and adb, no other dependencies.
- **mcp/**: MCP server (stdio) that gives an agent the `phone_*` tools.
- **relay/**: runs on a developer machine or cloud session and serves the phone on `localhost`, so a preview pane can show it without a token in the URL.
- **server/**: Docker Compose for one phone (redroid) + gateway + HTTPS (Caddy), and a setup script.

Status: early. Tested against a fake adb (`npm test`); not yet run against a real redroid server.

## 1. Run a phone on a server

Needs an x86_64 or arm64 Linux server with the binder kernel module (Ubuntu 22.04/24.04 works). No KVM needed.
4 vCPU / 8 GB runs one phone comfortably.

```bash
git clone <this repo> && cd devphone/server
sudo ./setup.sh          # first run: installs modules + Docker, writes .env with fresh tokens
nano .env                # set DEVPHONE_DOMAIN to a hostname pointing at this server
sudo ./setup.sh          # second run: starts the phone, gateway and HTTPS
```

It prints a watch-only link: `https://<domain>/?token=<view token>`. The drive token stays in `.env`.

## 2. Give an agent the phone (MCP)

Claude Code, in the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "devphone": {
      "command": "node",
      "args": ["devphone/mcp/server.js"],
      "env": { "DEVPHONE_URL": "https://phone.example.com", "DEVPHONE_TOKEN": "${DEVPHONE_TOKEN}", "NODE_USE_ENV_PROXY": "1" }
    }
  }
}
```

Tools: `phone_status`, `phone_screenshot`, `phone_ui`, `phone_tap` (text / id / x,y), `phone_swipe`, `phone_type`,
`phone_key`, `phone_install` (path or URL), `phone_launch`, `phone_stop`, `phone_logcat`, `phone_lease`, `phone_release`.
Actions return a screenshot so the agent sees the result straight away.

Several agents can share one phone: `phone_lease` gives one of them the controls; the others can still watch.

## 3. Watch it in a preview pane

```bash
DEVPHONE_URL=https://phone.example.com DEVPHONE_TOKEN=... NODE_USE_ENV_PROXY=1 node devphone/relay/relay.js 8701
```

Open `http://127.0.0.1:8701/` (or point your editor's preview pane at port 8701). Click to tap, drag to swipe,
type to send text.

## 4. Install every PR's build (GitHub Actions)

```yaml
- name: Install on devphone
  env:
    DEVPHONE_TOKEN: ${{ secrets.DEVPHONE_TOKEN }}
    DEVPHONE_URL: ${{ vars.DEVPHONE_URL }}
  if: ${{ env.DEVPHONE_TOKEN != '' }}
  run: |
    curl -fsS -X POST --data-binary @app/build/outputs/apk/debug/app-debug.apk \
      -H "Authorization: Bearer $DEVPHONE_TOKEN" \
      "$DEVPHONE_URL/api/install?launch=com.example.app"
```

## HTTP API

All routes take `Authorization: Bearer <token>` (or `?token=` for browsers). The view token may only use the GET routes.

| Route | Does |
|---|---|
| `GET /` | Viewer page |
| `GET /api/status` | online, foreground app, lease |
| `GET /api/screenshot` | PNG |
| `GET /api/stream` | `multipart/x-mixed-replace` PNG frames, sent only while someone watches |
| `GET /api/ui` | UI elements: text, desc, id, flags, bounds, center |
| `POST /api/tap` | `{text}` / `{id}` / `{x,y}` |
| `POST /api/swipe` | `{x1,y1,x2,y2,ms}` |
| `POST /api/text` | `{text}` |
| `POST /api/key` | `{key: "back" \| "home" \| "recents" \| "enter" \| …}` |
| `POST /api/install?launch=pkg` | body is the raw APK |
| `POST /api/launch`, `/api/stop` | `{package}` |
| `GET /api/logcat?lines=200&level=E` | recent log lines |
| `POST /api/lease`, `DELETE /api/lease` | `{holder, ttlSec}`; actions from other holders get 423 |

## Limits

- redroid has no Google Play services, so Play Integrity, Google Sign-In and Firebase App Check do not work on it. Use email sign-in or a test build for those.
- Don't put different customers' unreleased apps on one host: redroid shares the host kernel.
- Streaming is PNG frames (about 4 fps), fine for watching tests, not for games. A video codec stream is a later step.

## License

MIT
