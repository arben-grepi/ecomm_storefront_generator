/**
 * Development-only logging utility
 * Only logs in development mode to reduce production noise
 */
const isDev = process.env.NODE_ENV === 'development';

export const devLog = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

export const devWarn = (...args) => {
  if (isDev) {
    console.warn(...args);
  }
};

