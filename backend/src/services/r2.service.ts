import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

class R2Service {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'chat-files';
    this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';
    
    const s3Config: any = {
      region: 'auto',
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true, // Crucial for S3-compatible providers like R2
    };

    if (process.env.CLOUDFLARE_R2_ENDPOINT) {
      s3Config.endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    } else {
      console.warn('WARNING: CLOUDFLARE_R2_ENDPOINT is not set. Storage will default to AWS S3.');
    }

    this.s3Client = new S3Client(s3Config);
  }

  async uploadFile(filePath: string, originalName: string, mimeType: string): Promise<string> {
    const fileExtension = path.extname(originalName);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
    const fileBuffer = await fs.readFile(filePath);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      
      // If a public URL is configured, use it. Otherwise, return a generic structure.
      // Note: R2 buckets are not public by default.
      if (this.publicUrl) {
        return `${this.publicUrl.replace(/\/$/, '')}/${fileName}`;
      }
      
      // Fallback to a structured R2 URL if publicUrl is not set
      // Usually looks like https://pub-<id>.r2.dev/<key>
      return fileName; 
    } catch (error) {
      console.error('R2 Upload Error:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  // Optional: Generate a signed URL for temporary access if bucket is private
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

export const r2Service = new R2Service();
