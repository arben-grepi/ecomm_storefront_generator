/**
 * Product Content Generator API Client
 * 
 * Utility functions to call the Python FastAPI server from your Next.js app.
 * 
 * Usage:
 *   import { generateProductContent } from '@/lib/productContentApi';
 *   
 *   const content = await generateProductContent(title, bodyHtml);
 */

/**
 * @typedef {Object} ProductContent
 * @property {string} displayName
 * @property {string} displayDescription
 * @property {string[]|null} bulletpoints
 */

/**
 * @typedef {Object} ProductContentRequest
 * @property {string} title
 * @property {string} body_html
 */

/**
 * @typedef {Object} ApiError
 * @property {string} detail
 */

// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_PRODUCT_API_URL || 'http://localhost:8000';

/**
 * Generate optimized product content from Shopify product data
 * 
 * @param {string} title - Product title from Shopify
 * @param {string} bodyHtml - Product description HTML (truncated at 'src=' to exclude images)
 * @returns {Promise<ProductContent>} Generated product content
 * @throws {Error} If the API request fails
 * 
 * @example
 * ```javascript
 * try {
 *   const content = await generateProductContent(
 *     'Turmeric & Vitamin C Cream -Lightweight Nourishment',
 *     '<h1>SPECIFICATIONS</h1><p>Feature: Moisturizing</p>'
 *   );
 *   console.log(content.displayName);
 * } catch (error) {
 *   console.error('Failed to generate content:', error);
 * }
 * ```
 */
export async function generateProductContent(title, bodyHtml) {
  console.log('[productContentApi] generateProductContent called', {
    titleLength: title?.length || 0,
    bodyHtmlLength: bodyHtml?.length || 0,
    apiUrl: API_BASE_URL
  });

  if (!title || !bodyHtml) {
    console.error('[productContentApi] Validation failed - missing title or body_html', {
      hasTitle: !!title,
      hasBodyHtml: !!bodyHtml
    });
    throw new Error('Title and body_html are required');
  }

  const startTime = Date.now();
  
  try {
    console.log('[productContentApi] Sending request to API', {
      url: `${API_BASE_URL}/generate`,
      method: 'POST'
    });

    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body_html: bodyHtml,
      }),
    });

    const requestDuration = Date.now() - startTime;
    console.log('[productContentApi] Received response', {
      status: response.status,
      statusText: response.statusText,
      duration: `${requestDuration}ms`,
      ok: response.ok
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => {
        console.error('[productContentApi] Failed to parse error response as JSON');
        return {
          detail: `HTTP error! status: ${response.status}`,
        };
      });
      
      console.error('[productContentApi] API error response', {
        status: response.status,
        errorData
      });
      
      throw new Error(errorData.detail || `API error: ${response.statusText}`);
    }

    const data = await response.json();
    const totalDuration = Date.now() - startTime;
    console.log('[productContentApi] Successfully parsed response', {
      duration: `${totalDuration}ms`,
      hasDisplayName: !!data.displayName,
      hasDisplayDescription: !!data.displayDescription,
      bulletpointCount: data.bulletpoints?.length || 0
    });
    
    return data;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorInfo = {
      duration: `${totalDuration}ms`,
    };
    
    if (error instanceof Error) {
      errorInfo.errorMessage = error.message;
      errorInfo.errorName = error.name;
      errorInfo.errorStack = error.stack;
      // Include full error object for detailed inspection
      console.error('[productContentApi] Request failed (Error object):', error);
    } else {
      errorInfo.errorType = typeof error;
      errorInfo.errorValue = error;
    }
    
    console.error('[productContentApi] Request failed (Error details):', errorInfo);

    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred while generating product content');
  }
}

/**
 * Check if the API server is running and healthy
 * 
 * @returns {Promise<boolean>} True if server is healthy
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Next.js API Route handler example
 * 
 * Place this in: app/api/product-content/route.ts (App Router)
 * or: pages/api/product-content.ts (Pages Router)
 * 
 * @example App Router (app/api/product-content/route.ts)
 * ```typescript
 * import { generateProductContent } from '@/lib/productContentApi';
 * import { NextRequest, NextResponse } from 'next/server';
 * 
 * export async function POST(request: NextRequest) {
 *   try {
 *     const { title, body_html } = await request.json();
 *     const content = await generateProductContent(title, body_html);
 *     return NextResponse.json(content);
 *   } catch (error) {
 *     return NextResponse.json(
 *       { error: error instanceof Error ? error.message : 'Unknown error' },
 *       { status: 500 }
 *     );
 *   }
 * }
 * ```
 */

