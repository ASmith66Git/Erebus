import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

export interface VideoProcessResult {
  compressedUri: string;
  thumbnailUri: string | null;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface CompressionProgress {
  progress: number;
  stage: 'compressing' | 'thumbnail' | 'complete';
}

export async function getFileSize(uri: string): Promise<number> {
  try {
    if (Platform.OS === 'web') {
      return 0;
    }
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? (info.size || 0) : 0;
  } catch (e) {
    return 0;
  }
}

export async function compressVideo(
  videoUri: string,
  onProgress?: (progress: CompressionProgress) => void
): Promise<VideoProcessResult> {
  const originalSize = await getFileSize(videoUri);
  
  if (Platform.OS === 'web') {
    return {
      compressedUri: videoUri,
      thumbnailUri: null,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
    };
  }

  try {
    onProgress?.({ progress: 0, stage: 'compressing' });
    
    const { Video: VideoCompressor } = await import('react-native-compressor');
    
    const compressedUri = await VideoCompressor.compress(
      videoUri,
      {
        compressionMethod: 'auto',
        maxSize: 1280,
      },
      (progress: number) => {
        onProgress?.({ progress: progress * 0.9, stage: 'compressing' });
      }
    );

    const compressedSize = await getFileSize(compressedUri);
    
    onProgress?.({ progress: 0.9, stage: 'thumbnail' });
    const thumbnailUri = await generateThumbnail(compressedUri);
    
    onProgress?.({ progress: 1, stage: 'complete' });

    return {
      compressedUri,
      thumbnailUri,
      originalSize,
      compressedSize,
      compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1,
    };
  } catch (error) {
    console.log('[VideoService] Compression not available, using original:', error);
    const thumbnailUri = await generateThumbnail(videoUri);
    return {
      compressedUri: videoUri,
      thumbnailUri,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
    };
  }
}

export async function generateThumbnail(videoUri: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  
  try {
    const VideoThumbnails = await import('expo-video-thumbnails');
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 1000,
      quality: 0.7,
    });
    return uri;
  } catch (error) {
    console.log('[VideoService] Thumbnail generation not available:', error);
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function isCompressionAvailable(): boolean {
  return Platform.OS !== 'web';
}
