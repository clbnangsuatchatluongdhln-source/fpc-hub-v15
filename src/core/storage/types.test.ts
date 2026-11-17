import { describe, expect, it } from 'vitest';
import { classifyFile, referenceFromMetadata } from './types';

describe('storage references', () => {
  it('keeps the recorded provider instead of guessing from a file extension', () => {
    expect(referenceFromMetadata({storage_provider:'b2',storage_path:'photo.jpg',kind:'image'}).provider).toBe('b2');
  });
  it('keeps old hub files in the files bucket and old videos in their original bucket', () => {
    expect(referenceFromMetadata({storage_path:'old.mp4',storage_provider:'supabase',file_type:'file',kind:'video'}).bucket).toBe('files');
    expect(referenceFromMetadata({storage_path:'videos/old.mp4',kind:'video'},'legacy').bucket).toBe('fpc-files');
  });
  it('uses the legacy adapter only when the caller identifies the legacy flow', () => {
    expect(referenceFromMetadata({storage_path:'old.pdf',kind:'document'},'legacy').provider).toBe('b2');
    expect(referenceFromMetadata({storage_path:'old.pdf'}).provider).toBe('supabase');
  });
  it('fails closed for unknown providers and missing object addresses', () => {
    expect(()=>referenceFromMetadata({storage_provider:'unknown',storage_path:'x'})).toThrow();
    expect(()=>referenceFromMetadata({storage_provider:'b2'})).toThrow();
  });
  it('preserves legacy video provenance when the new file_type default is present',()=>{
    expect(referenceFromMetadata({storage_path:'videos/general/old.mp4',kind:'video',file_type:'file',storage_provider:'supabase'},'legacy').bucket).toBe('fpc-files');
    expect(referenceFromMetadata({storage_path:'owner/old.mp4',kind:'video',file_type:'file',storage_provider:'supabase'},'legacy').bucket).toBe('files');
  });
  it('classifies file kind independently of provider selection', () => {
    expect(classifyFile({type:'image/png'})).toBe('image');
    expect(classifyFile({type:'video/mp4'})).toBe('video');
    expect(classifyFile({type:'application/pdf'})).toBe('document');
  });
});
