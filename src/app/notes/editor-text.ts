/**
 * Line separator to configure in CodeMirror so a note round-trips unchanged.
 * CodeMirror joins lines with one separator; notes imported with CRLF keep CRLF.
 * Returns undefined for the default ("\n").
 */
export function detectLineSeparator(text: string): '\r\n' | undefined {
  if (!text.includes('\r')) return undefined;
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return crlf > 0 && crlf >= lf ? '\r\n' : undefined;
}
