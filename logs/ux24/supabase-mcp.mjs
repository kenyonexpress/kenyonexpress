// UX24: drive the official Supabase MCP server (read-only) over stdio with the
// CLI's access token (the claude.ai connector needs an OAuth this session cannot
// complete; same server, same tools). What 272 and the register flow rest on:
// the profiles columns as they are, the triggers on auth.users and their name
// order, handle_new_user's body in production, the RLS on profiles, and the
// security advisors.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = 'ixvwfbuvfxxsjiywhbbb'
const srv = spawn(
  'npx',
  ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', `--project-ref=${ref}`],
  { env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] },
)
let buf = ''
const pending = new Map()
srv.stdout.on('data', (d) => {
  buf += d
  for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id != null && pending.has(msg.id)) pending.get(msg.id)(msg)
    } catch {}
  }
})
srv.stderr.on('data', (d) => process.stderr.write(d))
let id = 0
const call = (method, params) =>
  new Promise((resolve) => {
    const myId = ++id
    pending.set(myId, resolve)
    srv.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
  })
const out = {}
out.initialize = (
  await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'ux24', version: '1' },
  })
).result?.serverInfo
srv.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
const tools = (await call('tools/list', {})).result?.tools ?? []
out.tools = tools.map((t) => t.name)
const sql = (query) => call('tools/call', { name: 'execute_sql', arguments: { query } })
const text = (r) => r.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(r.error ?? r)
out.profilesColumns = text(
  await sql(
    "select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position",
  ),
)
out.authUserTriggers = text(
  await sql(
    "select t.tgname, p.proname, t.tgenabled, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and not t.tgisinternal order by t.tgname",
  ),
)
out.handleNewUser = text(
  await sql("select pg_get_functiondef('public.handle_new_user'::regproc) as def"),
)
out.profilesPolicies = text(
  await sql(
    "select policyname, roles::text, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='profiles' order by policyname",
  ),
)
out.profilesGrants = text(
  await sql(
    "select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema='public' and table_name='profiles' group by grantee order by grantee",
  ),
)
out.termsInMetadata = text(
  await sql(
    "select count(*) as users, count(*) filter (where raw_user_meta_data ? 'terms_accepted_at') as with_terms from auth.users",
  ),
)
out.migrations = text(await call('tools/call', { name: 'list_migrations', arguments: {} })).slice(
  -600,
)
out.advisors = text(
  await call('tools/call', { name: 'get_advisors', arguments: { type: 'security' } }),
).slice(0, 2500)
writeFileSync('logs/ux24/supabase-mcp.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 6000))
srv.kill()
