require('dotenv').config();
console.log('R2_PUBLIC_URL:', process.env.CLOUDFLARE_R2_PUBLIC_URL);
console.log('URL Length:', process.env.CLOUDFLARE_R2_PUBLIC_URL?.length);
