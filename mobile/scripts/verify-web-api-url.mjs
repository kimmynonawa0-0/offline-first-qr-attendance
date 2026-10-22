import { validateProductionApiUrl } from '../src/web-api-url.mjs';

const apiOrigin = validateProductionApiUrl(process.env.EXPO_PUBLIC_API_URL);
console.log(`Building production PWA for API: ${apiOrigin}`);
