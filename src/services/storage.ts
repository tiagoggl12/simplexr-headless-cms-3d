export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export class LocalStorageService {
  constructor(private readonly baseUrl: string) {}

  async presignUpload(path: string): Promise<PresignedUpload> {
    const normalized = path.replace(/^\/+/, '');
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/${normalized}`,
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
      },
    };
  }
}
