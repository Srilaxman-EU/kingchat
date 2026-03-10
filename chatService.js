import { supabase } from './supabase';

/**
 * Send a text message in a chat
 */
export const sendMessage = async (chatId, text, sender) => {
  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    text,
    type: 'text',
    timestamp: new Date().toISOString(),
    read: false,
  }]).select().single();
  if (error) throw error;
  return data;
};

/**
 * Send a voice message (audioBlob uploaded to Supabase Storage)
 */
export const sendVoiceMessage = async (chatId, audioBlob, sender) => {
  const fileName = `${chatId}/${Date.now()}.ogg`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(fileName, audioBlob, { contentType: 'audio/ogg' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    voice_url: uploadData.path,
    type: 'voice',
    timestamp: new Date().toISOString(),
    read: false,
  }]).select().single();
  if (error) throw error;
  return data;
};

/**
 * Send a file (document, photo, video, or audio) in a chat
 */
export const sendFile = async (chatId, file, sender, fileType = 'document') => {
  const fileName = `${fileType}/${chatId}/${Date.now()}_${file.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('files')
    .upload(fileName, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('messages').insert([{
    chat_id: chatId,
    sender,
    file_url: uploadData.path,
    file_name: file.name,
    file_size: file.size,
    file_type: fileType,
    type: 'file',
    timestamp: new Date().toISOString(),
    read: false,
  }]).select().single();
  if (error) throw error;
  return data;
};

/**
 * Retrieve paginated chat history for a given chat.
 * Returns messages in ascending timestamp order (oldest first).
 * For initial load, pass no `before` to get the most recent N messages.
 * For older-message pagination, pass a timestamp to retrieve messages before it.
 */
export const getMessages = async (chatId, limit = 50, before = null) => {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('timestamp', before);
  }

  const { data, error } = await query;
  if (error) throw error;
  // Reverse so the result is always chronological (oldest → newest)
  return (data || []).reverse();
};

/**
 * Subscribe to real-time new messages in a chat
 * Returns the Supabase channel — call channel.unsubscribe() to clean up
 */
export const subscribeToMessages = (chatId, onMessage) => {
  const channel = supabase
    .channel(`messages:${chatId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => onMessage(payload.new)
    )
    .subscribe();
  return channel;
};

/**
 * Mark all unread messages in a chat as read (for the given user)
 */
export const markAsRead = async (chatId, currentUser) => {
  const { error } = await supabase
    .from('messages')
    .update({ read: true })
    .eq('chat_id', chatId)
    .neq('sender', currentUser)
    .eq('read', false);
  if (error) throw error;
};

/**
 * Get an existing chat between two users, or create one if it doesn't exist
 */
export const getOrCreateChat = async (user1, user2) => {
  const { data: existing, error: selectError } = await supabase
    .from('chats')
    .select('*')
    .or(
      `and(participant1.eq.${user1},participant2.eq.${user2}),` +
      `and(participant1.eq.${user2},participant2.eq.${user1})`
    )
    .single();

  if (existing) return existing;
  if (selectError && selectError.code !== 'PGRST116') throw selectError;

  const { data: created, error: insertError } = await supabase
    .from('chats')
    .insert([{ participant1: user1, participant2: user2 }])
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
};

/**
 * List all chats for a user
 */
export const getUserChats = async (username) => {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .or(`participant1.eq.${username},participant2.eq.${username}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};
