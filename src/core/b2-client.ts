import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = import.meta.env.VITE_B2_ENDPOINT;
const keyId = import.meta.env.VITE_B2_KEY_ID;
const appKey = import.meta.env.VITE_B2_APPLICATION_KEY;
export const B2_BUCKET = import.meta.env.VITE_B2_BUCKET_NAME;

if (!endpoint || !keyId || !appKey || !B2_BUCKET) {
  console.warn('⚠️ Cảnh báo: Thiếu cấu hình Backblaze B2 trong .env.local');
}

export const s3Client = new S3Client({
  endpoint: endpoint,
  region: 'us-east-1', // B2 yêu cầu region mặc định là us-east-1
  credentials: {
    accessKeyId: keyId || '',
    secretAccessKey: appKey || '',
  },
});

/**
 * Tạo link tải file bảo mật từ B2 (có thời hạn 1 giờ)
 * @param fileName Tên file (chính là Key đã lưu trên B2)
 */
export async function getB2DownloadUrl(fileName: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: B2_BUCKET,
      Key: fileName,
    });
    // Link có hiệu lực trong 3600 giây (1 giờ)
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('Lỗi khi tạo link B2:', error);
    throw new Error('Không thể tạo link tải file từ B2');
  }
}
