# Cloudflare Turnstile Setup

Cloudflare Turnstile provides CAPTCHA-free bot protection for public forms.

## Current Status

Turnstile is **integrated and active** on the following forms:
- Login (`/login`)
- Signup (`/signup`)
- Password reset (`/forgot-password`)
- Contact form (`/contact`)
- Supplier application (`/supplier/apply`)

## Configuration

### 1. Create Turnstile Site

1. Visit [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Click **Add Site**
3. Configure:
   - **Site name**: KenyonExpress
   - **Domain**: `kenyonexpress.co.il` (production) or `localhost` (development)
   - **Widget Mode**: Managed (recommended) or Invisible
4. Save and copy the **Site Key** and **Secret Key**

### 2. Set Environment Variables

Add to `.env.local` (development) and Vercel environment variables (production):

```bash
# Public key - rendered in the widget, safe to expose
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA... 

# Secret key - server-side verification only, NEVER expose
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

### 3. Verification Behavior

**When configured** (both keys set):
- Widget renders on forms
- Server verifies token on submission
- Failed verification returns error: "אימות האנושיות נכשל. נסו שוב."

**When NOT configured** (keys missing):
- Widget does not render (graceful degradation)
- Server verification passes (returns `true`)
- Rate limiting and honeypot still protect forms
- Warning logged: form works but without CAPTCHA

## Implementation Details

### Server-Side

Located in `src/lib/security/turnstile.ts`:

```typescript
import { verifyTurnstile, TURNSTILE_FIELD } from '@/lib/security/turnstile'

// In server action:
const ip = await getClientIp()
if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
  return { error: 'אימות האנושיות נכשל. נסו שוב.' }
}
```

### Client-Side

Use the `TurnstileWidget` component:

```tsx
import TurnstileWidget from '@/components/shared/TurnstileWidget'

<form action={submitAction}>
  {/* form fields */}
  <TurnstileWidget />
  <button type="submit">שלח</button>
</form>
```

Reset after error:

```typescript
import { resetTurnstile } from '@/lib/security/turnstile-client'

useEffect(() => {
  if (state.error) resetTurnstile()
}, [state.error])
```

## Rate Limiting

All Turnstile-protected forms also have rate limiting applied:

| Endpoint | Rate Limit | Identifier |
|----------|------------|------------|
| Login | 10/hour + 20/hour per account | IP + email |
| Signup | 5/hour | IP |
| Password reset | 5/hour + 5/hour per email | IP + email |
| Contact | 5/hour | IP |
| Supplier lead | 5/hour | IP |

Rate limits use Upstash Redis (if configured) with Postgres fallback.

## Testing

### Development
1. Leave keys unset → forms work without CAPTCHA
2. Set keys → widget appears, verification required

### Production
1. Always set both keys
2. Test form submission success and failure paths
3. Monitor logs for `turnstile.verify_failed` events

## Troubleshooting

### Widget doesn't appear
- Check `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
- Verify domain matches Turnstile site configuration
- Check browser console for errors

### Server verification always fails
- Verify `TURNSTILE_SECRET_KEY` is set
- Check server can reach `https://challenges.cloudflare.com`
- Review logs for `rate_limit.upstash_failed` or network errors

### Form submits without solving CAPTCHA
- Keys are not configured (working as designed)
- Check environment variables are loaded (restart dev server)

## Related Files

- `src/lib/security/turnstile.ts` - Server verification
- `src/lib/security/turnstile-client.ts` - Client reset helper
- `src/components/shared/TurnstileWidget.tsx` - React component
- `src/server/actions/auth.ts` - Auth form handlers
- `src/server/actions/contact.ts` - Contact form handler
- `src/server/actions/supplier-lead.ts` - Supplier form handler
- `.env.example` (lines 568-578) - Environment variable documentation

## Security Notes

1. **Secret key is sensitive** - Never commit to git, never prefix with `NEXT_PUBLIC_`
2. **Token is single-use** - Reset widget after failed submission
3. **IP forwarding** - Requires Vercel proxy to set `x-forwarded-for` correctly
4. **Fail-open when unconfigured** - By design, allows forms to work in development
5. **Honeypot remains active** - Even when Turnstile is off
