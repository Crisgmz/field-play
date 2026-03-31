import { hasSupabaseEnv } from '@/lib/env';

// Transitional flag while replacing mock data with Supabase reads/writes.
export const useSupabaseData = hasSupabaseEnv;
