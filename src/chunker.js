const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 100;
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;
  if (!text || text.trim().length === 0) return [];
  const lines = text.split(/\n+/);
  const sections = [];
  let currentHeading = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length < 120 && /^[A-Z\d]/.test(trimmed) && !trimmed.endsWith('.')) {
      currentHeading = trimmed;
      continue;
    }
    sections.push({
      heading: currentHeading,
      text: trimmed
    });
  }
  const fullText = sections.map(s => s.heading ? `[${s.heading}] ${s.text}` : s.text).join(' ');
  const chunks = [];
  let start = 0;
  let idx = 0;
  while (start < fullText.length) {
    let end = Math.min(start + chunkSize, fullText.length);
    if (end < fullText.length) {
      const lookback = Math.max(start, end - Math.floor(chunkSize * 0.2));
      const segment = fullText.slice(lookback, end);
      const sentenceEnd = segment.lastIndexOf('. ');
      if (sentenceEnd !== -1) {
        end = lookback + sentenceEnd + 2;
      }
    }
    const chunkStr = fullText.slice(start, end).trim();
    if (chunkStr.length > 0) {
      chunks.push({
        chunkIndex: idx++,
        text: chunkStr
      });
    }
    start = end - overlap;
    if (start >= fullText.length) break;
    if (end >= fullText.length) break;
  }
  return chunks;
}
