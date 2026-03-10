import { supabase } from './supabase';

/**
 * Get a deterministic chat ID for two users.
 * Sorting ensures the same ID regardless of argument order.
 */
export const getChatId = (user1, user2) => {
  return [user1, user2].sort().join('_');
};

/**
 * Send a text message between two users.
 */
export const sendTextMessage = async (sender, receiver, text) => {
  const chatId = getChatId(sender, receiver);
  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    receiver,
    text,
    type: 'text',
    timestamp: new Date().toISOString(),
  }]);
  if (error) throw error;
  return data;
};

/**
 * Upload a voice message blob to Supabase Storage, then insert a message record.
 */
export const sendVoiceMessage = async (sender, receiver, audioBlob) => {
  const chatId = getChatId(sender, receiver);
  const path = `${chatId}/${Date.now()}.ogg`;

  const { error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(path, audioBlob, { contentType: 'audio/ogg', upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(path);

  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    receiver,
    voice_url: urlData.publicUrl,
    type: 'voice',
    timestamp: new Date().toISOString(),
  }]);
  if (error) throw error;
  return data;
};

/**
 * Upload a file to Supabase Storage, then insert a message record.
 * fileType should be one of: 'document', 'photo', 'video', 'audio'
 */
export const sendFileMessage = async (sender, receiver, file, fileType = 'document') => {
  const chatId = getChatId(sender, receiver);
  const fileName = file.name || `file_${Date.now()}`;
  const path = `${fileType}/${chatId}/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('files')
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('files').getPublicUrl(path);

  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    receiver,
    file_url: urlData.publicUrl,
    file_name: fileName,
    file_size: file.size,
    file_type: fileType,
    type: 'file',
    timestamp: new Date().toISOString(),
  }]);
  if (error) throw error;
  return data;
};

/**
 * Load full chat history between two users, ordered by timestamp.
 */
export const loadChatHistory = async (me, other) => {
  const chatId = getChatId(me, other);
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data || [];
};

/**
 * Subscribe to real-time incoming messages for a user.
 * Returns a Supabase channel that can be removed with supabase.removeChannel().
 */
export const subscribeToMessages = (me, onMessage) => {
  return supabase
    .channel(`messages_${me}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `receiver=eq.${me}`,
    }, (payload) => {
      onMessage(payload.new);
    })
    .subscribe();
};
