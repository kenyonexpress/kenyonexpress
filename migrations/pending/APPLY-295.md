# Applying Migration 295 via Supabase MCP

Migration 295 (notification_preferences) is ready to be applied to the database.

## Prerequisites

- Supabase MCP authenticated (via `claude mcp` or claude.ai connector settings)
- Migration 280 (user_consents) already applied

## Apply via Supabase MCP

In an interactive Claude session with Supabase MCP authenticated:

```
Use Supabase MCP to apply migration 295_notification_preferences.sql from migrations/pending/
```

The MCP will:
1. Run preflight_295.sql to verify migration 280 exists
2. Execute 295_notification_preferences.sql
3. Create the notification_preferences table with RLS policies
4. Set up triggers for auto-creation and updated_at
5. Backfill existing users

## Verification

After application, verify:

```sql
-- Check table exists
SELECT * FROM notification_preferences LIMIT 1;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'notification_preferences';

-- Verify trigger
SELECT * FROM pg_trigger WHERE tgname LIKE '%notification_preferences%';
```

## Migration Contents

- **Table**: notification_preferences with columns for email and in-app preferences
- **RLS**: Users can select/insert/update their own preferences only
- **Triggers**: auto-creation on user signup, updated_at maintenance
- **Backfill**: Creates preference rows for existing users with defaults
- **Grants**: authenticated and service_role can read/write

## Related Code

- UI: `src/app/(account)/account/notifications/page.tsx`
- Actions: `src/server/actions/notification-consent.ts`
- Components: `src/components/account/EmailToggle.tsx`
- Consent keys: `src/lib/consent-keys.ts`
