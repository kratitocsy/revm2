import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Same project as the web app (src/lib/supabase.js). The anon key is public
// by design; row-level security is what protects the data.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://dhzjtjekbvxxsauzhadl.supabase.co';
const SUPABASE_ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoemp0amVrYnZ4eHNhdXpoYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjQ2NjUsImV4cCI6MjA5Nzk0MDY2NX0.2Uo36DtE7NpwW5wxOEwnmWjbXhHWXV-wf6qc7kXDtYE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No browser URL to parse in a native app; OAuth returns via deep link
    // and is exchanged in src/lib/auth.ts.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
