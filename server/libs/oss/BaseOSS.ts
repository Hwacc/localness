export abstract class BaseOSS {
  abstract generateUploadToken(): string
  abstract generateDownloadAccessUrl(key: string, deadline?: number): string

  // upload asset
  abstract uploadAsset(filename: string, buffer: Buffer): Promise<string>

  // delete asset
  abstract deleteAsset(key: string): Promise<boolean>
}
