/**
 * API route to trigger Shopify product import
 * 
 * This executes the import script logic server-side.
 * Note: The import script is complex and may take several minutes to complete.
 * This API route will run the import asynchronously and return immediately.
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Trigger the Shopify product import by executing the script
 */
export async function POST(request) {
  try {
    console.log('[Import API] 🚀 Starting Shopify product import...');
    
    // Get the script path
    const scriptPath = path.join(process.cwd(), 'scripts', 'import-shopify-products.js');
    
    // Execute the script asynchronously (don't wait for it to complete)
    // This allows the API to return immediately while the import runs in the background
    execAsync(`node "${scriptPath}"`, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large output
    })
      .then(({ stdout, stderr }) => {
        console.log('[Import API] ✅ Import completed');
        if (stdout) console.log('[Import API] Output:', stdout);
        if (stderr) console.warn('[Import API] Warnings:', stderr);
      })
      .catch((error) => {
        console.error('[Import API] ❌ Import failed:', error);
      });
    
    // Return immediately - import runs in background
    return NextResponse.json({
      success: true,
      message: 'Import started. The import process is running in the background. Check server logs for progress.',
      note: 'This may take several minutes depending on the number of products. Refresh the page to see updated products.',
    });
  } catch (error) {
    console.error('[Import API] ❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to trigger import',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check import status
 */
export async function GET() {
  return NextResponse.json({
    message: 'Shopify product import API endpoint',
    note: 'Use POST to trigger import. The import runs asynchronously in the background.',
  });
}

