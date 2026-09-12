/**
 * Site-wide identity constants — the single source of truth.
 */
export const SITE_URL = 'https://binbinbob.work';
export const SITE_NAME = 'binbin';

export const CONTACT_EMAIL = 'robin92062574@gmail.com';
export const GITHUB_URL = 'https://github.com/NameCallBob';

/**
 * Engineering principles.
 *
 * Each one is the rule left behind by a specific incident recorded in
 * content/projects.ts — the payroll cache that ignored identity, the DRF
 * default that was AllowAny until launch week, the UI that reported success
 * on writes that never landed. Stated as rules rather than as virtues,
 * because a virtue is not evidence of anything.
 */
export const PHILOSOPHY: { zh: string; en: string }[] = [
  {
    zh: '快取鍵少了使用者身分,就是權限漏洞。',
    en: 'A cache key without the user in it is an authorization hole.',
  },
  {
    zh: '先全部拒絕,要開的才開。',
    en: 'Deny everything first. Open what has to be open.',
  },
  {
    zh: '把錯誤靜默成「一切正常」,比壞掉更危險。',
    en: 'Silencing an error into "everything is fine" is worse than breaking.',
  },
];
