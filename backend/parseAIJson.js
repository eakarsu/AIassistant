/**
 * 3-strategy JSON parser for AI responses.
 * Strategy 1: direct JSON.parse on the trimmed content
 * Strategy 2: extract from ```json ... ``` markdown fence
 * Strategy 3: greedy extract first {...} block via regex
 *
 * Returns { ok: true, data } on success or { ok: false, raw } on failure.
 */
function parseAIJson(content) {
  if (content == null) return { ok: false, raw: content };
  if (typeof content === 'object') return { ok: true, data: content };
  const text = String(content).trim();

  // Strategy 1: direct parse
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch { /* fall through */ }

  // Strategy 2: ```json ... ``` markdown fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return { ok: true, data: JSON.parse(fence[1].trim()) };
    } catch { /* fall through */ }
  }

  // Strategy 3: greedy first {...}
  const greedy = text.match(/\{[\s\S]*\}/);
  if (greedy) {
    try {
      return { ok: true, data: JSON.parse(greedy[0]) };
    } catch { /* fall through */ }
  }

  return { ok: false, raw: text };
}

module.exports = { parseAIJson };
