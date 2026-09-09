import { createClient } from '@supabase/supabase-js';
import { REVM2_CONFIG } from '../../lib/supabase.js';

// Shared by every React app under src/apps/ (mobile-home,
// desktop-dashboard, ...). The rest of the site creates a fresh `sb`
// per page via `window.supabase.createClient(...)` (CDN script) — see
// src/lib/supabase.js's note on that. These bundled React apps use
// @supabase/supabase-js from npm instead (no CDN global to depend on)
// but point at the same project/anon key, so auth state (session,
// cookies) is shared with the rest of the site.
export const sb = createClient(REVM2_CONFIG.SUPABASE_URL, REVM2_CONFIG.SUPABASE_ANON);
