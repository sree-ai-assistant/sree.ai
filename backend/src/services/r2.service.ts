import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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
    this.publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').split('#')[0]?.trim() ?? '';
    
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

  async uploadFile(filePath: string, originalName: string, mimeType: string, bucket?: string): Promise<string> {
    const fileExtension = path.extname(originalName);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
    const fileBuffer = await fs.readFile(filePath);

    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      
      const targetBucket = bucket || this.bucketName;
      const bucketPublicUrl = targetBucket === 'image-generation'
        ? process.env.IMAGE_GENERATION_PUBLIC_URL
        : targetBucket === 'video-generations'
          ? process.env.VIDEO_GENERATION_PUBLIC_URL
          : this.publicUrl;

      if (bucketPublicUrl) {
        return `${bucketPublicUrl.replace(/\/$/, '')}/${fileName}`;
      }
      
      return fileName; 
    } catch (error) {
      console.error('R2 Upload Error:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  async uploadBase64(base64Data: string, mimeType: string, bucket?: string): Promise<string> {
    // Remove data:image/png;base64, if present
    const base64String = base64Data.includes(',') ? (base64Data.split(',')[1] ?? '') : base64Data;
    const buffer = Buffer.from(base64String, 'base64');
    
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `generated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${extension}`;
    
    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      
      const targetBucket = bucket || this.bucketName;
      const bucketPublicUrl = targetBucket === 'image-generation'
        ? process.env.IMAGE_GENERATION_PUBLIC_URL
        : targetBucket === 'video-generations'
          ? process.env.VIDEO_GENERATION_PUBLIC_URL
          : this.publicUrl;

      if (bucketPublicUrl) {
        return `${bucketPublicUrl.replace(/\/$/, '')}/${fileName}`;
      }
      
      return fileName;
    } catch (error) {
      console.error('R2 Base64 Upload Error:', error);
      throw new Error('Failed to upload base64 to storage');
    }
  }

  // Optional: Generate a signed URL for temporary access if bucket is private
  async getSignedUrl(key: string, expiresIn: number = 3600, bucket?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, (command as any), { expiresIn });
  }

  /**
   * Batch-delete objects from R2. Max 1000 keys per call (S3 API limit).
   * Used for cleanup of expired user data.
   */
  async deleteObjects(keys: string[], bucket?: string): Promise<number> {
    if (!keys.length) return 0;
    const targetBucket = bucket || this.bucketName;
    let totalDeleted = 0;

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        await this.s3Client.send(new DeleteObjectsCommand({
          Bucket: targetBucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));
        totalDeleted += batch.length;
      } catch (error) {
        console.error(`R2 Batch Delete Error (bucket: ${targetBucket}):`, error);
      }
    }
    return totalDeleted;
  }
}

export const r2Service = new R2Service();
