import { getObjectUrl } from './storage/client';

/**
 * Tạo link tải file bảo mật từ B2 (có thời hạn 1 giờ)
 * @param fileName Tên file (chính là Key đã lưu trên B2)
 */
export async function getB2DownloadUrl(fileName: string): Promise<string> {
  try {
    return await getObjectUrl({provider:'b2',storagePath:fileName,kind:'document'});
  } catch (error) {
    console.error('Lỗi khi tạo link B2:', error);
    throw new Error('Không thể tạo link tải file từ B2');
  }
}
