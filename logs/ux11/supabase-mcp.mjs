// UX11: drive the official Supabase MCP server (read-only) over stdio with the
// CLI's access token, because the claude.ai Supabase connector needs an OAuth
// the non-interactive session cannot complete. Same server, same tools.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = 'ixvwfbuvfxxsjiywhbbb'
const srv = spawn(
  'npx',
  ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', `--project-ref=${ref}`],
  {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe'],
  },
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
    clientInfo: { name: 'ux11', version: '1' },
  })
).result?.serverInfo
srv.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
const tools = (await call('tools/list', {})).result?.tools ?? []
out.tools = tools.map((t) => t.name)
const sql = (query) => call('tools/call', { name: 'execute_sql', arguments: { query } })
const text = (r) => r.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(r.error ?? r)
out.policies = text(
  await sql(
    "select policyname, roles::text, cmd, qual from pg_policies where schemaname='public' and tablename='suppliers' order by policyname",
  ),
)
out.suppliers = text(
  await sql(
    "select count(*) filter (where status='active' and deleted_at is null) as active, count(*) filter (where status='active' and deleted_at is null and logo_url is not null) as with_logo from public.suppliers",
  ),
)
out.anonProbe = text(
  await sql(
    'begin; set local role anon; select count(*) as anon_visible from public.suppliers; rollback;',
  ),
)
out.advisors = text(
  await call('tools/call', { name: 'get_advisors', arguments: { type: 'security' } }),
).slice(0, 1500)
writeFileSync('logs/ux11/supabase-mcp.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 3000))
srv.kill()
