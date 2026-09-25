/**
 * Wraps canvas text while preserving all explicit line breaks from a textarea.
 * A newline is an author-controlled break; soft wrapping only applies within it.
 */
export function wrapCanvasText(
  ctx: { measureText: (text: string) => Pick<TextMetrics, 'width'> },
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];

  const lines: string[] = [];
  const normalizedText = text.replace(/\r\n?/g, '\n');

  for (const hardLine of normalizedText.split('\n')) {
    if (!hardLine) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    const tokens = hardLine.match(/\S+\s*|\s+/g) || [hardLine];

    const appendCharacterWrappedToken = (token: string) => {
      for (const character of token) {
        if (currentLine && ctx.measureText(currentLine + character).width > maxWidth) {
          lines.push(currentLine);
          currentLine = character;
        } else {
          currentLine += character;
        }
      }
    };

    for (const token of tokens) {
      if (currentLine && ctx.measureText(currentLine + token).width > maxWidth) {
        lines.push(currentLine);
        currentLine = '';
      }

      if (ctx.measureText(token).width > maxWidth) {
        appendCharacterWrappedToken(token);
      } else {
        currentLine += token;
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines;
}