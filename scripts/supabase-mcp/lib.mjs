/**
 * MCP stdio framing: one JSON-RPC message per line. Kept apart from the
 * process plumbing in ../supabase-mcp.mjs so the framing has a unit test.
 */

export function encodeMessage(message) {
  return `${JSON.stringify(message)}\n`
}

/**
 * Split a stdout buffer into parsed frames and the unterminated remainder.
 * A line that is not JSON (a server log line on stdout) is skipped, not fatal.
 */
export function splitFrames(buffer) {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const frames = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      frames.push(JSON.parse(trimmed))
    } catch {
      // not a frame
    }
  }
  return { frames, rest }
}
