import type { User } from '../store/useStore';

const TRUSTED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isEnabledValue = (value: string | undefined) => {
  if (!value) return true;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const getLocalTrustedEmail = () => {
  const email = String(import.meta.env.VITE_LOCAL_TRUSTED_EMAIL || '').trim();
  const enabled = isEnabledValue(import.meta.env.VITE_LOCAL_TRUSTED_DEVICE);
  if (!email || !enabled || typeof window === 'undefined') return null;
  if (!TRUSTED_LOCAL_HOSTS.has(window.location.hostname)) return null;
  return email;
};

export const createLocalTrustedUser = (email: string): User => ({
  id: email,
  email,
  tier: 'enterprise',
  trial_img_left: 9999,
  trial_vid_left: 9999,
  prepaid_img: 9999,
  prepaid_vid: 9999,
  used_img: 0,
  used_vid: 0,
  associated_ips: ['local-trusted-device'],
  subscribed_agents: ['retrieval', 'modeling', 'compute', 'rendering', 'cover'],
  subscription_expires_at: null,
  cover_used_this_month: 0,
  cover_month_key: 'local',
});
