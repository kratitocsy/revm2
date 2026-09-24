# Old pages: what's still used, what's retired

The React dashboard (`home.html` → `/home`) is the app. The older standalone
HTML pages stay only while they have something the dashboard doesn't; once a
feature is ported, its page is retired with a redirect. The Android app
bundles the HTML files locally, so retired pages keep their files until the
mobile app moves off them — the redirect only applies on the website.

## Rules that apply no matter which page is used (server-side)

- Communities are created only by `rpc_create_community`; a direct insert is
  always a plain study group, and nothing but the server can turn a group
  into or out of a community (migration 0084).
- Joining a community needs the owner's approval (`can_self_join_group`).
- Community ownership moves only via `rpc_transfer_community_ownership`.
- All money: see `docs/PAYMENTS.md`.

## Status

| Page | Status | Why / what it's still used for |
|---|---|---|
| `home.html` | **The app** | Dashboard: Home, Focus Lock, Schedules, Community & Study Rooms, Battleground, WYNKOINS, Earn, Settings |
| `battle.html` | **Retired** → `/home?page=battleground` | Same backend as the dashboard's Battleground, which has more (search, top battlers, history) |
| `groups.html` | Kept (partly) | Group **video/voice calls**, **shared materials** (Drive upload), **group challenges** with coin bounties, **group statistics**. Community create/join/transfer now follow the server rules; communities are discovered in the dashboard |
| `timer.html` | Kept | Starts site/app **block presets** (the dashboard's Focus Lock only relays an active block) |
| `tracker.html` | Kept | Recall Curve (spaced revision) — not in the dashboard |
| `chat.html` | Kept | 1:1 chat and calls |
| `partners.html` | Kept | Partner matching |
| `store.html` | Kept | Full shop (verified badge, avatars, ranks, inventory). Coins and redeem are server-side, same as the dashboard's WYNKOINS page |
| `pledge.html`, `telegram.html`, `onboarding.html`, `admin.html` | Kept | Not in the dashboard |
| `blocks.html` | Hidden | 3D Library (coming soon). Not linked; the desktop app now opens `/home` |
| `product.html`, `product-tour.html`, `waitlist.html`, `marketing.html`, `film.html`, `privacy.html`, `terms.html`, `login.html` | Public site | Marketing / legal / sign-in |

## Next to port (then retire `groups.html`)

1. Group video/voice calls
2. Shared materials (incl. Google Drive upload)
3. Group challenges with coin bounties
4. Group statistics
