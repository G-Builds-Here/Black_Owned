// Mock minio client for testing
export class Client {
  constructor(_config: unknown) {
    // Mock constructor
  }

  async listBuckets(): Promise<unknown[]> {
    return [];
  }

  async presignedPutObject(
    _bucket: string,
    _objectName: string,
    _expirySeconds: number,
    _headers?: unknown
  ): Promise<string> {
    return "https://mock-minio-url";
  }
}

export default { Client };
