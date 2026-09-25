import { TextBubble } from '../types';

function normalizedText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function overlapRatio(left: TextBubble, right: TextBubble): number {
  const yOverlap = Math.max(0, Math.min(left.box_2d[2], right.box_2d[2]) - Math.max(left.box_2d[0], right.box_2d[0]));
  const xOverlap = Math.max(0, Math.min(left.box_2d[3], right.box_2d[3]) - Math.max(left.box_2d[1], right.box_2d[1]));
  const intersection = yOverlap * xOverlap;
  const leftArea = (left.box_2d[2] - left.box_2d[0]) * (left.box_2d[3] - left.box_2d[1]);
  const rightArea = (right.box_2d[2] - right.box_2d[0]) * (right.box_2d[3] - right.box_2d[1]);
  return intersection / Math.max(1, Math.min(leftArea, rightArea));
}

function isExistingBubble(existing: TextBubble, detected: TextBubble): boolean {
  const matchingSource = normalizedText(existing.source_text) !== ''
    && normalizedText(existing.source_text) === normalizedText(detected.source_text);
  const overlap = overlapRatio(existing, detected);
  return (matchingSource && overlap >= 0.25) || overlap >= 0.75;
}

/** Adds only newly detected page text and never replaces a prior translation. */
export function mergeMissingOcrBubbles(
  existingBubbles: TextBubble[],
  detectedBubbles: TextBubble[]
): TextBubble[] {
  const merged = [...existingBubbles];

  detectedBubbles.forEach((detected) => {
    if (!merged.some(existing => isExistingBubble(existing, detected))) {
      merged.push(detected);
    }
  });

  return merged
    .sort((left, right) => left.box_2d[0] - right.box_2d[0] || left.box_2d[1] - right.box_2d[1])
    .map((bubble, index) => ({ ...bubble, reading_order: index + 1 }));
}