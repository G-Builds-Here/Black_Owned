// Mock MinIO client for testing
export class MinioClient {
  constructor() {}

  presignedPutObject() {
    return Promise.resolve('https://mock-presigned-url');
  }
}
