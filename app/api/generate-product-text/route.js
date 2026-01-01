import { NextResponse } from 'next/server';

/**
 * API route to generate product content
 * Proxies requests to the external Python FastAPI server if configured,
 * otherwise returns an error indicating the service is unavailable
 */
export async function POST(request) {
  try {
    const { title, body_html } = await request.json();

    if (!title || !body_html) {
      return NextResponse.json(
        { detail: 'Title and body_html are required' },
        { status: 400 }
      );
    }

    // Get the external API URL from environment variable
    const API_BASE_URL = process.env.NEXT_PUBLIC_PRODUCT_API_URL || process.env.PRODUCT_API_URL;
    
    if (!API_BASE_URL) {
      console.warn('[generate-product-text] No PRODUCT_API_URL configured, service unavailable');
      return NextResponse.json(
        { 
          detail: 'Product content generation service is not configured. Please set PRODUCT_API_URL or NEXT_PUBLIC_PRODUCT_API_URL environment variable.' 
        },
        { status: 503 }
      );
    }

    // Proxy the request to the external Python FastAPI server
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body_html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        detail: `HTTP error! status: ${response.status}`,
      }));
      
      return NextResponse.json(
        { detail: errorData.detail || `API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[generate-product-text] Error proxying request:', error);
    
    // Check if it's a network error (server not available)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { 
          detail: 'Unable to connect to product content generation service. The service may not be running or accessible.' 
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

