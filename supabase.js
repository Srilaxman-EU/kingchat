import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://btbjtyxkfjidhvixzpzm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Ymp0eXhrZmppZGh2aXh6cHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjYyNjIsImV4cCI6MjA4ODQ0MjI2Mn0.wfkm3g1uIo1P2dZBRoK_4Fp2UcYR6OSSmN13UqIcyT0';

// Storage buckets required:
//   "voice-messages" — stores voice message audio files
//   "files"          — stores shared documents, photos, videos, and audio files
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);