/**
 * Build-time script to configure environment-specific settings
 * This creates a runtime config file for the app based on environment variables
 */
import fs from 'fs';
import path from 'path';

// Determine if we're in a production build
// For Cloudflare Pages deployment, we need to force production mode
// We can check if this is a production build based on arguments
const isProduction = process.env.CF_PAGES === 'true' || process.argv.includes('--production') || process.env.NODE_ENV === 'production';
console.log('Build environment variables:', { 
  CF_PAGES: process.env.CF_PAGES,
  NODE_ENV: process.env.NODE_ENV,
  argv: process.argv
});

// When running the pages:deploy command, we want to force production mode
const isDeployCommand = process.argv.some(arg => arg.includes('pages:deploy') || arg.includes('pages-deploy'));

// Determine the final production state - if either standard checks or deploy command is detected
const useProductionConfig = isProduction || isDeployCommand;

// Create the config file content
const configContent = `// This file is auto-generated - do not edit directly
export const API_CONFIG = {
  // In production (Pages deployment), API calls are handled by Functions on same domain
  // In development, we use the local worker server
  BASE_URL: ${useProductionConfig ? '"/api"' : '"http://localhost:8787/api"'},
  IS_PRODUCTION: ${useProductionConfig}
};
`;

// Write the config file
const configDir = path.join(process.cwd(), 'src', 'config');
const configFile = path.join(configDir, 'api-config.ts');

// Ensure the directory exists
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Write the config file
fs.writeFileSync(configFile, configContent);

console.log(`API config file created at ${configFile}`);
console.log(`Environment: ${useProductionConfig ? 'production' : 'development'}`);
console.log(`API_BASE_URL set to: ${useProductionConfig ? '/api' : 'http://localhost:8787'}`);
console.log(`Deploy command detected: ${isDeployCommand}`);
console.log(`Production flags detected: ${isProduction}`);

