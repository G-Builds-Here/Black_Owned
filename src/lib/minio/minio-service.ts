/**
 * MinIO Service
 *
 * Provides presigned URL generation for MinIO object storage operations.
 * Supports generating presigned PUT URLs for secure file uploads.
 */

import * as Minio from "minio";

/**
 * Configuration for MinIO connection
 */
export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  defaultBucket: string;
}

/**
 * Presigned URL request parameters
 */
export interface PresignedPutRequest {
  bucket: string;
  objectName: string;
  expirySeconds: number;
  contentType?: string;
}

/**
 * Result of a presigned URL generation
 */
export interface PresignedUrlResult {
  url: string;
  expiresInSeconds: number;
  objectName: string;
  bucket: string;
}

/**
 * MinIO service class for handling presigned URL operations
 */
export class MinioService {
  private client: Minio.Client;
  private config: MinioConfig;

  constructor(config: MinioConfig) {
    this.config = config;
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  /**
   * Generate a presigned PUT URL for uploading an object
   *
   * @param request - The presigned PUT request parameters
   * @returns The presigned URL and metadata
   */
  async generatePresignedPutUrl(
    request: PresignedPutRequest
  ): Promise<PresignedUrlResult> {
    const bucket = request.bucket || this.config.defaultBucket;
    const { objectName, expirySeconds, contentType } = request;

    const url = await this.client.presignedPutObject(
      bucket,
      objectName,
      expirySeconds
    );

    return {
      url,
      expiresInSeconds: expirySeconds,
      objectName,
      bucket,
    };
  }

  /**
   * Generate multiple presigned PUT URLs for batch uploads
   *
   * @param bucket - The bucket name
   * @param objectNames - Array of object names to generate URLs for
   * @param expirySeconds - Expiry time in seconds (default: 900 = 15 minutes)
   * @returns Array of presigned URL results
   */
  async generatePresignedPutUrlsBatch(
    bucket: string,
    objectNames: string[],
    expirySeconds: number = 900
  ): Promise<PresignedUrlResult[]> {
    const promises = objectNames.map((objectName) =>
      this.generatePresignedPutUrl({
        bucket,
        objectName,
        expirySeconds,
      })
    );

    return Promise.all(promises);
  }

  /**
   * Validate that a bucket exists and is accessible
   */
  async validateBucket(bucket: string): Promise<boolean> {
    try {
      const buckets = await this.client.listBuckets();
      return buckets.some((b) => b.name === bucket);
    } catch {
      return false;
    }
  }
}

/**
 * Create a MinIO service instance from environment variables
 */
export function createMinioServiceFromEnv(): MinioService {
  const endpoint = process.env.MINIO_ENDPOINT || "localhost";
  const port = parseInt(process.env.MINIO_PORT || "9000", 10);
  const useSSL = process.env.MINIO_SSL === "true";
  const accessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
  const secretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
  const defaultBucket = process.env.MINIO_DEFAULT_BUCKET || "verification-docs";

  return new MinioService({
    endpoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    defaultBucket,
  });
}

