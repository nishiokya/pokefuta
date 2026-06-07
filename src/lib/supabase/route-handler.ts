import { createRouteHandlerClient as _createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// @supabase/auth-helpers-nextjs returns SupabaseClient<DB, SchemaName, Schema> (3-param style),
// but the installed supabase-js SupabaseClient class uses 5 params where the 3rd is SchemaName
// (a string), not Schema (the schema object). When Database["public"] satisfies GenericSchema,
// the mismatch causes all table types to resolve to `never`. Cast to SupabaseClient<Database>
// (1-param) which uses correct defaults.
export function createRouteHandlerClient(
  context: Parameters<typeof _createRouteHandlerClient>[0]
): SupabaseClient<Database> {
  return _createRouteHandlerClient<Database>(context) as unknown as SupabaseClient<Database>;
}
