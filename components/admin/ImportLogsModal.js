'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ImportLogsModal({ isOpen, onClose, importId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const logEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Poll for logs
  useEffect(() => {
    if (!isOpen || !importId) return;

    const pollLogs = async () => {
      try {
        const response = await fetch(`/api/admin/import-shopify-products?importId=${importId}`);
        if (!response.ok) {
          // If 404, the import might not have started yet or logs were cleared
          if (response.status === 404) {
            return;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setLoading(false); // Stop showing loading spinner once we have logs
        }
        
        if (data.completed) {
          setCompleted(true);
          setLoading(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
        
        // If there's an error message, show it but keep polling
        if (data.error && logs.length === 0) {
          setLogs([`⚠️ ${data.error}`]);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    // Poll immediately
    pollLogs();
    
    // Then poll every 2 seconds
    pollIntervalRef.current = setInterval(pollLogs, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, importId]);

  if (!isOpen) return null;

  // Format log line with colors
  const formatLogLine = (line) => {
    if (!line) return null;
    
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Determine log type and styling
    let className = 'text-zinc-700 dark:text-zinc-300';
    if (trimmed.includes('✅') || trimmed.includes('Success')) {
      className = 'text-emerald-600 dark:text-emerald-400';
    } else if (trimmed.includes('❌') || trimmed.includes('Error') || trimmed.includes('Failed')) {
      className = 'text-red-600 dark:text-red-400';
    } else if (trimmed.includes('⚠️') || trimmed.includes('Warning')) {
      className = 'text-amber-600 dark:text-amber-400';
    } else if (trimmed.includes('📋') || trimmed.includes('📦') || trimmed.includes('🌍') || trimmed.includes('📤')) {
      className = 'text-blue-600 dark:text-blue-400';
    } else if (trimmed.includes('💡') || trimmed.includes('ℹ️')) {
      className = 'text-zinc-500 dark:text-zinc-400';
    }

    return (
      <div className={`font-mono text-sm ${className} whitespace-pre-wrap break-words`}>
        {trimmed}
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-3xl border border-zinc-200/70 bg-white/95 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/95 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-6 dark:border-zinc-700">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Import Logs
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {completed ? 'Import completed' : 'Import in progress...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Logs Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50 dark:bg-zinc-950">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-8 w-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="ml-3 text-zinc-600 dark:text-zinc-400">Waiting for logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
              No logs available yet
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((line, index) => (
                <div key={index}>{formatLogLine(line)}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="flex items-center justify-end gap-3">
            {completed && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                ✅ Import completed
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded-full border border-zinc-200 bg-white px-6 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {completed ? 'Close' : 'Close (Import continues)'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

