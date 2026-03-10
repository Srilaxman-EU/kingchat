import { supabase } from './supabase';
import { Platform } from 'react-native';

/**
 * Download a file from Supabase Storage and return a local URI / Blob URL
 */
export const downloadFile = async (bucket, path) => {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;

  if (Platform.OS === 'web') {
    return URL.createObjectURL(data);
  }
  // On native, return the blob — callers can write it to the file system as needed
  return data;
};

/**
 * Generate a public or signed download URL for a file in Supabase Storage
 */
export const getFileDownloadUrl = async (bucket, path, expiresIn = 3600) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
};

/**
 * Generate a download URL for a voice message
 */
export const getVoiceDownloadUrl = async (path, expiresIn = 3600) => {
  return getFileDownloadUrl('voice-messages', path, expiresIn);
};

/**
 * Delete a file from Supabase Storage
 */
export const deleteFile = async (bucket, path) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};

/**
 * Format a file size in bytes to a human-readable string (e.g. "1.4 MB")
 */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};
