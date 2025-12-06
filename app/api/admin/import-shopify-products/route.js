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
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory store for import logs (in production, use Redis or a database)
const importLogs = new Map();

/**
 * Trigger the Shopify product import by executing the script
 * Can accept selectedItems to import only specific products/variants
 */
export async function POST(request) {
  try {
    let selectedItems = null;
    try {
      const body = await request.json();
      selectedItems = body.selectedItems;
    } catch (error) {
      // No body provided - import all products (backward compatibility)
      selectedItems = null;
    }
    
    // Generate unique import ID
    const importId = randomUUID();
    
    // Initialize logs storage
    importLogs.set(importId, {
      logs: [],
      completed: false,
      startTime: Date.now(),
    });
    
    console.log('[Import API] 🚀 Starting Shopify product import...', { importId });
    if (selectedItems && selectedItems.length > 0) {
      console.log(`[Import API] Importing ${selectedItems.length} selected product(s)`);
    } else {
      console.log('[Import API] Importing all products (no selection provided)');
    }
    
    // Get the script path
    const scriptPath = path.join(process.cwd(), 'scripts', 'import-shopify-products.js');
    
    // Detect standalone build mode (Next.js standalone output)
    // In standalone builds, node_modules are in .next/standalone/node_modules/
    const standaloneNodeModules = path.join(process.cwd(), '.next', 'standalone', 'node_modules');
    const isStandalone = existsSync(standaloneNodeModules);
    
    // Build environment variables
    const env = { ...process.env };
    if (selectedItems && selectedItems.length > 0) {
      env.SELECTED_SHOPIFY_ITEMS_JSON = JSON.stringify(selectedItems);
    }
    
    // Set NODE_PATH to include standalone node_modules if in standalone mode
    // This allows the script to resolve modules like firebase-admin
    if (isStandalone) {
      const existingNodePath = env.NODE_PATH || '';
      env.NODE_PATH = existingNodePath 
        ? `${standaloneNodeModules}${path.delimiter}${existingNodePath}`
        : standaloneNodeModules;
      console.log(`[Import API] Detected standalone build, setting NODE_PATH: ${env.NODE_PATH}`);
    }
    
    // Helper to add log line
    const addLog = (line) => {
      const logData = importLogs.get(importId);
      if (logData) {
        logData.logs.push(line);
        // Keep only last 1000 lines to prevent memory issues
        if (logData.logs.length > 1000) {
          logData.logs = logData.logs.slice(-1000);
        }
      }
    };
    
    // Execute the script and capture output in real-time
    const childProcess = exec(`node "${scriptPath}"`, {
      cwd: process.cwd(),
      env: env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large output
    });
    
    // Capture stdout line by line
    childProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        const trimmed = line.trim();
        // Filter out dotenv messages, Node.js warnings, and other noise
        if (trimmed && 
            !trimmed.includes('[dotenv@') && 
            !trimmed.includes('injecting env') &&
            !trimmed.includes('audit secrets') &&
            !trimmed.includes('tip:') &&
            !trimmed.includes('suppress all logs') &&
            !trimmed.includes('MODULE_TYPELESS_PACKAGE_JSON') &&
            !trimmed.includes('Reparsing as ES module') &&
            !trimmed.includes('To eliminate this warning') &&
            !trimmed.includes('Use `node --trace-warnings') &&
            !trimmed.includes('(node:') &&
            !trimmed.includes('[WARNING]')) {
          addLog(trimmed);
          console.log(`[Import ${importId}]`, trimmed);
        }
      });
    });
    
    // Capture stderr line by line
    childProcess.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        const trimmed = line.trim();
        // Filter out dotenv messages, Node.js warnings, and other noise
        if (trimmed && 
            !trimmed.includes('[dotenv@') && 
            !trimmed.includes('injecting env') &&
            !trimmed.includes('audit secrets') &&
            !trimmed.includes('tip:') &&
            !trimmed.includes('suppress all logs') &&
            !trimmed.includes('MODULE_TYPELESS_PACKAGE_JSON') &&
            !trimmed.includes('Reparsing as ES module') &&
            !trimmed.includes('To eliminate this warning') &&
            !trimmed.includes('Use `node --trace-warnings') &&
            !trimmed.includes('(node:')) {
          addLog(`[WARNING] ${trimmed}`);
          console.warn(`[Import ${importId}]`, trimmed);
        }
      });
    });
    
    // Handle completion
    childProcess.on('close', (code) => {
      const logData = importLogs.get(importId);
      if (logData) {
        logData.completed = true;
        logData.endTime = Date.now();
        if (code === 0) {
          addLog('✅ Import completed successfully');
        } else {
          addLog(`❌ Import failed with exit code ${code}`);
        }
        
        // Clean up after 1 hour
        setTimeout(() => {
          importLogs.delete(importId);
        }, 60 * 60 * 1000);
      }
    });
    
    // Handle errors
    childProcess.on('error', (error) => {
      addLog(`❌ Import error: ${error.message}`);
      const logData = importLogs.get(importId);
      if (logData) {
        logData.completed = true;
        logData.endTime = Date.now();
      }
      console.error('[Import API] ❌ Import failed:', error);
    });
    
    // Return immediately with import ID
    const itemCount = selectedItems?.length || 'all';
    return NextResponse.json({
      success: true,
      importId,
      message: `Import started for ${itemCount} product(s). The import process is running in the background.`,
      note: 'This may take several minutes depending on the number of products.',
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
 * GET endpoint to check import status and get logs
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('importId');
    
    if (importId) {
      const logData = importLogs.get(importId);
      if (logData) {
        return NextResponse.json({
          logs: logData.logs,
          completed: logData.completed,
          startTime: logData.startTime,
          endTime: logData.endTime,
        });
      } else {
        // Return empty logs instead of 404 to prevent errors in the modal
        return NextResponse.json({
          logs: [],
          completed: false,
          error: 'Import ID not found. The import may not have started yet or logs were cleared.',
        });
      }
    }
    
    return NextResponse.json({
      message: 'Shopify product import API endpoint',
      note: 'Use POST to trigger import. The import runs asynchronously in the background.',
      usage: 'Use GET with ?importId=<id> to get import logs and status.',
    });
  } catch (error) {
    console.error('[Import API] GET error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get import status',
        message: error.message || 'Unknown error',
        logs: [],
        completed: false,
      },
      { status: 500 }
    );
  }
}

