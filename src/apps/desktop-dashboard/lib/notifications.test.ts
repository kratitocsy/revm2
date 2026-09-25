import { describe, expect, it, vi } from 'vitest';

vi.mock('../../_shared/supabaseClient', () => ({ sb: {} }));

import { notificationHref, notificationIcon, timeAgo, type AppNotification } from './notifications';

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n1', type: 'announcement', title: 'Hi', body: null, ref_id: null, link: null, read: false,
  created_at: new Date().toISOString(), ...over,
});

describe('notificationHref', () => {
  it('uses the notification link when there is one', () => {
    expect(notificationHref(n({ link: '/store', type: 'grid_session_invite', ref_id: 'r1' }))).toBe('/store');
  });
  it('derives a link from the type', () => {
    expect(notificationHref(n({ type: 'grid_session_invite', ref_id: 'a b' }))).toBe('/home.html?room=a%20b');
    expect(notificationHref(n({ type: 'challenge_invite' }))).toBe('/groups.html');
    expect(notificationHref(n({ type: 'gvg_invite' }))).toBe('/groups.html');
  });
  it('has nowhere to go for a plain announcement', () => {
    expect(notificationHref(n({}))).toBeNull();
    expect(notificationHref(n({ type: 'grid_session_invite' }))).toBeNull();
  });
});

describe('notificationIcon / timeAgo', () => {
  it('picks an icon per type', () => {
    expect(notificationIcon('announcement')).toBe('📣');
    expect(notificationIcon('something_new')).toBe('🔔');
  });
  it('formats recent times', () => {
    const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    expect(timeAgo(ago(5))).toBe('just now');
    expect(timeAgo(ago(5 * 60))).toBe('5m ago');
    expect(timeAgo(ago(3 * 3600))).toBe('3h ago');
    expect(timeAgo(ago(2 * 86400))).toBe('2d ago');
  });
});
