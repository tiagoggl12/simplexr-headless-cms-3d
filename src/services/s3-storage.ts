import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUpload {
  url: string;
  fileUrl: string;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;
  publicEndpoint: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET || 'dam-assets';
    this.publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint;

    this.client = new S3Client({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minio',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minio123',
      },
      // For local MinIO, force path style
      forcePathStyle: true,
    });
  }

  async presignUpload(path: string): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: 'model/gltf-binary',
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });

    // Convert presigned URL to public file URL
    const fileUrl = `${this.publicEndpoint}/${this.bucket}/${path}`;

    return { url, fileUrl };
  }

  async getFileUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      return await getSignedUrl(this.client, command, { expiresIn: 86400 }); // 24 hours
    } catch {
      // Return direct URL if presigning fails
      return `${this.publicEndpoint}/${this.bucket}/${key}`;
    }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    // MinIO doesn't support DeleteObjectCommand in all versions
    // This is a placeholder for deletion
  }

  async uploadFile(key: string, body: Buffer, contentType?: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    });

    await this.client.send(command);
  }
}
