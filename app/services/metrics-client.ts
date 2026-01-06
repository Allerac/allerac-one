// Supabase client for metrics tracking

import { supabase } from '@/app/clients/supabase';

/**
 * Returns the main Supabase client
 * Metrics tables are in the same database
 */
export function getMetricsClient() {
  return supabase;
}
