import { supabase } from './supabase';

/**
 * Upload a voice message audio blob to the 'voice-messages' bucket.
 * Returns the public URL of the uploaded file.
 */
export const uploadVoiceMessage = async (chatId, audioBlob) => {
  const path = `${chatId}/${Date.now()}.ogg`;
  const { error } = await supabase.storage
    .from('voice-messages')
    .upload(path, audioBlob, { contentType: 'audio/ogg', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('voice-messages').getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Upload a file (document, photo, video, audio) to the 'files' bucket.
 * Returns an object with { url, name, size, type }.
 */
export const uploadFile = async (chatId, file, fileType = 'document') => {
  const fileName = file.name || `file_${Date.now()}`;
  const path = `${fileType}/${chatId}/${Date.now()}_${fileName}`;
  const { error } = await supabase.storage
    .from('files')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('files').getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: fileName,
    size: file.size,
    type: fileType,
  };
};

/**
 * Get the public URL for an existing file in a Supabase Storage bucket.
 */
export const getFileUrl = (bucket, path) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Detect the semantic file type from a File object's MIME type.
 * Returns one of: 'photo', 'video', 'audio', 'document'.
 */
export const detectFileType = (file) => {
  const mime = file.type || '';
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};
