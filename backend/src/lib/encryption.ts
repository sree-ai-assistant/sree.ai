import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM
 */
export function encrypt(text: string): { encryptedData: string, iv: string } {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables');
  }

  // Handle hex string if provided, otherwise treat as raw
  const keyBuffer = encryptionKey.length === 64 
    ? Buffer.from(encryptionKey, 'hex') 
    : Buffer.alloc(32, encryptionKey);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    // We store the auth tag at the end of the encrypted data
    encryptedData: encrypted + authTag,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypts a string using AES-256-GCM
 */
export function decrypt(encryptedData: string, ivHex: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables');
  }

  const keyBuffer = encryptionKey.length === 64 
    ? Buffer.from(encryptionKey, 'hex') 
    : Buffer.alloc(32, encryptionKey);

  const iv = Buffer.from(ivHex, 'hex');
  
  // Extract auth tag from the end
  const authTag = Buffer.from(encryptedData.slice(-32), 'hex');
  const actualEncryptedData = encryptedData.slice(0, -32);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(actualEncryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a deterministic HMAC-SHA256 blind index hash of an API key using ENCRYPTION_KEY.
 * Enables fast O(1) indexed duplicate lookups without decrypting, and protects against rainbow table attacks.
 */
export function hashApiKey(text: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables');
  }

  const keyBuffer = encryptionKey.length === 64 
    ? Buffer.from(encryptionKey, 'hex') 
    : Buffer.alloc(32, encryptionKey);

  const clean = typeof text === 'string' ? text.trim() : '';
  return crypto
    .createHmac('sha256', keyBuffer)
    .update(clean)
    .digest('hex');
}
