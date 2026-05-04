/**
 * Supabase generated types belong here. Replace with output from:
 * `npx supabase gen types typescript --project-id <id> > src/types/database.ts`
 *
 * The empty schema keeps `createClient<Database>()` type-safe until tables exist.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
