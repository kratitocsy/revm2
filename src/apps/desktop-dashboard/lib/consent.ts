import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Optional-use consent (Privacy Policy 4.1): emails, analytics and
   personalised ads, plus the self-declared age group. Asked once on
   /consent.html; changed later in Settings > Privacy. Writes go through
   set_my_consent (migration 0098), which keeps personalised ads off for
   anyone under 18 and logs every change.
   ============================================================ */

// Keep in step with consent.html and login.html. Bumping it asks everyone again.
export const CONSENT_VERSION = '2026-09-28';

export type AgeGroup = 'under_18' | 'adult';

export interface ConsentChoices {
  ageGroup: AgeGroup;
  marketing: boolean;
  analytics: boolean;
  personalisedAds: boolean;
}

// null = never answered. Throws when the check itself fails (offline, or
// the table isn't there yet) so callers can decide not to block on it.
export async function fetchMyConsent(userId: string): Promise<(ConsentChoices & { policyVersion: string }) | null> {
  const { data, error } = await sb.from('user_consent')
    .select('policy_version, age_group, marketing, analytics, personalised_ads')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Could not load your privacy choices');
  if (!data) return null;
  return {
    policyVersion: data.policy_version,
    ageGroup: data.age_group === 'adult' ? 'adult' : 'under_18',
    marketing: !!data.marketing,
    analytics: !!data.analytics,
    personalisedAds: !!data.personalised_ads,
  };
}

// Sends someone who hasn't answered the current version to the consent
// screen once. Any failure just lets them carry on.
export async function redirectIfConsentNeeded(userId: string): Promise<void> {
  try {
    const c = await fetchMyConsent(userId);
    if (!c || c.policyVersion !== CONSENT_VERSION) window.location.replace('/consent.html?next=home');
  } catch { /* never lock anyone out over this */ }
}

export async function saveMyConsent(c: ConsentChoices): Promise<ConsentChoices> {
  const { data, error } = await sb.rpc('set_my_consent', {
    p_policy_version: CONSENT_VERSION,
    p_age_group: c.ageGroup,
    p_marketing: c.marketing,
    p_analytics: c.analytics,
    p_personalised_ads: c.personalisedAds && c.ageGroup === 'adult',
    p_source: 'settings',
  });
  if (error || !data) throw new Error(error?.message || 'Could not save your privacy choices');
  // The server may have changed the age group (a date of birth on file wins).
  return {
    ageGroup: data.age_group === 'adult' ? 'adult' : 'under_18',
    marketing: !!data.marketing,
    analytics: !!data.analytics,
    personalisedAds: !!data.personalised_ads,
  };
}
