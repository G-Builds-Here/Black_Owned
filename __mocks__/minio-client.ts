/**
 * Mock MinIO client for unit tests
 */
export default class MinioClient {
  presignedPutObject = jest.fn().mockResolvedValue("https://mock-url");
  removeObject = jest.fn().mockResolvedValue(undefined);
}
