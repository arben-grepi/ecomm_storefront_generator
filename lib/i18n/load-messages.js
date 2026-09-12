/**
 * Load UI message catalogs by language code.
 * Only registers languages that have a messages/*.json file.
 * Unknown / missing languages fall back to English.
 */

const MESSAGE_LOADERS = {
  en: () => import('@/messages/en.json'),
  sq: () => import('@/messages/sq.json'),
};

/** Languages with a hand-written catalog in the repo */
export const AVAILABLE_LANGUAGES = Object.keys(MESSAGE_LOADERS);

/**
 * @param {string} lang - BCP-47 language code (e.g. 'sq', 'fi', 'en')
 * @returns {Promise<object>}
 */
export async function loadMessages(lang) {
  const code = (lang || 'en').toLowerCase().split('-')[0];
  const loader = MESSAGE_LOADERS[code];

  if (!loader) {
    console.warn(`[i18n] No messages for "${code}", falling back to en`);
    return (await MESSAGE_LOADERS.en()).default;
  }

  try {
    return (await loader()).default;
  } catch (error) {
    console.error(`[i18n] Failed to load messages for "${code}", falling back to en:`, error);
    return (await MESSAGE_LOADERS.en()).default;
  }
}

/**
 * Resolve nested key like "cart.checkout" from a messages object.
 * @param {object} messages
 * @param {string} key
 * @param {object} [params] - optional { name: 'x' } for "{name}" interpolation
 * @returns {string}
 */
export function translate(messages, key, params) {
  if (!key) return '';

  const parts = key.split('.');
  let value = messages;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') {
      value = undefined;
      break;
    }
    value = value[part];
  }

  if (typeof value !== 'string') {
    return key;
  }

  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] != null ? String(params[name]) : `{${name}}`
  );
}
