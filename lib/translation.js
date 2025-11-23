/**
 * Translation utilities
 * 
 * Uses translation APIs to translate English text to Finnish/German on-the-fly
 * Supports: Google Cloud Translation API, DeepL API, or returns original text as fallback
 * 
 * Setup:
 * 1. Add one of these to your .env.local:
 *    - GOOGLE_CLOUD_TRANSLATE_API_KEY=your-key-here (Google Cloud Translation)
 *    - DEEPL_API_KEY=your-key-here (DeepL - recommended for European languages)
 * 
 * 2. For Google Cloud: Get API key from https://console.cloud.google.com/apis/credentials
 *    Enable "Cloud Translation API" in your project
 * 
 * 3. For DeepL: Get free API key from https://www.deepl.com/pro-api
 *    Free tier: 500,000 characters/month
 */

// Simple in-memory cache for translations (expires after 24 hours)
const translationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Translate text from English to target language
 * Uses caching to avoid repeated API calls
 */
export async function translateText(text, targetLanguage) {
  if (!text || text.trim() === '') return '';
  
  // Check cache first
  const cacheKey = `${text}|${targetLanguage}`;
  const cached = translationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.translated;
  }
  
  // Translate using API
  let translated = text;
  
  try {
    // Option 1: Use Google Cloud Translation API (if configured)
    if (process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY) {
      translated = await translateWithGoogle(text, targetLanguage);
    } 
    // Option 2: Use DeepL API (if configured)
    else if (process.env.DEEPL_API_KEY) {
      translated = await translateWithDeepL(text, targetLanguage);
    }
    // Option 3: Use libre-translate or fallback
    else {
      // For now, return original text if no API is configured
      // Only log warning in development mode and only once per session
      if (process.env.NODE_ENV === 'development' && !translationCache.has('_warned_no_api')) {
        console.warn(`[Translation] No translation API configured. Add GOOGLE_CLOUD_TRANSLATE_API_KEY or DEEPL_API_KEY to .env.local for translations. Returning original text.`);
        translationCache.set('_warned_no_api', { translated: true, timestamp: Date.now() });
      }
      translated = text;
    }
    
    // Cache the result
    translationCache.set(cacheKey, {
      translated,
      timestamp: Date.now(),
    });
    
    return translated;
  } catch (error) {
    console.error(`[Translation] Failed to translate text:`, error);
    // Return original text on error
    return text;
  }
}

/**
 * Translate using Google Cloud Translation API
 */
async function translateWithGoogle(text, targetLanguage) {
  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new Error('Google Cloud Translate API key not configured');
  }
  
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: targetLanguage === 'fi' ? 'fi' : 'de',
      format: 'text',
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data.translations[0].translatedText;
}

/**
 * Translate using DeepL API
 */
async function translateWithDeepL(text, targetLanguage) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    throw new Error('DeepL API key not configured');
  }
  
  const url = 'https://api-free.deepl.com/v2/translate';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text: text,
      source_lang: 'EN',
      target_lang: targetLanguage === 'fi' ? 'FI' : 'DE',
    }),
  });
  
  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.translations[0].text;
}

/**
 * Clear translation cache (useful for testing or when content is updated)
 */
export function clearTranslationCache() {
  translationCache.clear();
}

