/**
 * Shared helpers for Shopify API failures.
 * Goal: never leak raw Shopify/network dumps to customers; always return a clear UI message.
 */

/**
 * Whether this looks like a credentials / config problem
 */
export function isShopifyConfigError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Missing Shopify') ||
    message.includes('Missing Storefront API') ||
    message.includes('SHOPIFY_STORE') ||
    message.includes('SHOPIFY_ACCESS_TOKEN') ||
    message.includes('SHOPIFY_STOREFRONT_ACCESS_TOKEN')
  );
}

/**
 * Whether this looks like a transient network / Shopify outage
 */
export function isShopifyUnavailableError(error) {
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();
  return (
    isShopifyConfigError(error) ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('aborted') ||
    lower.includes('timeout') ||
    message.includes('404') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('Shopify API error') ||
    message.includes('Shopify Storefront API error') ||
    message.includes('Shopify Admin GraphQL')
  );
}

/**
 * User-facing message for checkout / shipping / inventory flows
 */
export function getShopifyUserMessage(error, fallback = 'Something went wrong. Please try again later.') {
  if (isShopifyConfigError(error)) {
    return 'Checkout is temporarily unavailable. Please try again later.';
  }

  const message = String(error?.message || error || '');

  if (message.includes('does not exist') || message.includes('merchandise')) {
    return 'Some products in your cart are not ready for checkout yet. Please try again in a moment.';
  }

  if (
    message.includes('404') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.toLowerCase().includes('fetch failed') ||
    message.toLowerCase().includes('network')
  ) {
    return 'We could not reach the checkout service. Please try again later.';
  }

  // Prefer short, already-user-facing messages; otherwise use fallback
  if (message && message.length < 180 && !message.includes('{') && !message.includes('\n')) {
    return message;
  }

  return fallback;
}

/**
 * Wrap a low-level Shopify fetch so network failures become clear Errors
 */
export async function safeShopifyFetch(url, options = {}, label = 'Shopify API') {
  try {
    return await fetch(url, options);
  } catch (error) {
    const reason = error?.message || String(error);
    throw new Error(`${label} network error: ${reason}`);
  }
}
