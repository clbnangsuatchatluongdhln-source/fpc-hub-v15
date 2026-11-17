import { getObjectUrl } from './client';
import { referenceFromMetadata, type FileMetadataLike } from './types';

export async function getFileDownloadUrl(file:FileMetadataLike):Promise<string> {
  return getObjectUrl(referenceFromMetadata(file,'legacy'));
}
