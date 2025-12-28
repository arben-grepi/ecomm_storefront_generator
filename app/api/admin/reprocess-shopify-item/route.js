import { NextResponse } from 'next/server';
import { getReprocessPreview, reprocessShopifyItem } from '@/lib/reprocess-shopify-item';

/**
 * GET - Get preview of what will be affected by reprocessing
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopifyItemId = searchParams.get('shopifyItemId');
    
    if (!shopifyItemId) {
      return NextResponse.json(
        { success: false, error: 'shopifyItemId is required' },
        { status: 400 }
      );
    }
    
    const preview = await getReprocessPreview(shopifyItemId);
    
    return NextResponse.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('[API] Error getting reprocess preview:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get reprocess preview' },
      { status: 500 }
    );
  }
}

/**
 * POST - Reprocess a Shopify item
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { shopifyItemId } = body;
    
    if (!shopifyItemId) {
      return NextResponse.json(
        { success: false, error: 'shopifyItemId is required' },
        { status: 400 }
      );
    }
    
    const result = await reprocessShopifyItem(shopifyItemId);
    
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[API] Error reprocessing shopify item:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reprocess shopify item' },
      { status: 500 }
    );
  }
}

