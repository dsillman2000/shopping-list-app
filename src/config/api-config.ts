// API Configuration
export const API_CONFIG = {
  // In production (Pages deployment), API calls are handled by Functions on same domain
  // In development, we use the local worker server
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  IS_PRODUCTION: import.meta.env.PROD
};

// Log the current API configuration during initialization
console.log('API Configuration:', {
  BASE_URL: API_CONFIG.BASE_URL,
  IS_PRODUCTION: API_CONFIG.IS_PRODUCTION,
  ENV_MODE: import.meta.env.MODE
});
