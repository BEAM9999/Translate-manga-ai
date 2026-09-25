import { OpenRouterModelEntry } from '../types';

export interface SmartParseResult {
  openRouterEntries: OpenRouterModelEntry[];
  geminiKeys: string[];
  rawItemsFound: number;
}

/**
 * Intelligent Smart Parser for extracting individual Model + API Key pairs
 * from unstructured text, code blocks, or configuration snippets.
 */
export function parseSmartKeysAndModels(inputText: string): SmartParseResult {
  const result: SmartParseResult = {
    openRouterEntries: [],
    geminiKeys: [],
    rawItemsFound: 0,
  };

  if (!inputText || inputText.trim() === '') {
    return result;
  }

  // 1. Split text by common block delimiters: lines of dashes, asterisks, equals, or blank lines
  const rawBlocks = inputText.split(/(?:-{3,}|\*{3,}|={3,}|\n\s*\n)/);

  for (let b = 0; b < rawBlocks.length; b++) {
    const block = rawBlocks[b].trim();
    if (!block) continue;

    let name = '';
    let id = '';
    let key = '';

    // Extract name = ...
    const nameMatch = block.match(/(?:name|title)\s*[:=]\s*(.+)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }

    // Extract id = ...
    const idMatch = block.match(/(?:id|model|model_id)\s*[:=]\s*(.+)/i);
    if (idMatch) {
      id = idMatch[1].trim();
    }

    // Extract key = ...
    const keyMatch = block.match(/(?:key|api_key|apikey)\s*[:=]\s*(.+)/i);
    if (keyMatch) {
      key = keyMatch[1].trim();
    }

    // Fallback: detect standalone keys in block if not labeled
    if (!key) {
      const openRouterMatch = block.match(/sk-or-v1-[a-zA-Z0-9_-]{20,}/i) || block.match(/sk-[a-zA-Z0-9_-]{20,}/i);
      if (openRouterMatch) key = openRouterMatch[0].trim();

      const geminiMatch = block.match(/AIzaSy[a-zA-Z0-9_-]{33}/i);
      if (geminiMatch) key = geminiMatch[0].trim();
    }

    // Handle Gemini Key
    if (key && key.startsWith('AIzaSy')) {
      if (!result.geminiKeys.includes(key)) {
        result.geminiKeys.push(key);
        result.rawItemsFound++;
      }
      continue;
    }

    // Handle OpenRouter Model + Key pair
    if (id || (key && (key.startsWith('sk-or-v1-') || key.startsWith('sk-')))) {
      const modelId = id || (key ? 'custom-model' : `model_${Date.now()}_${b}`);
      const modelName = name || (id ? id : `OpenRouter Model ${result.openRouterEntries.length + 1}`);

      // Check if we already have this exact ID
      const existingIdx = result.openRouterEntries.findIndex(e => e.id === modelId);
      if (existingIdx === -1) {
        result.openRouterEntries.push({
          id: modelId,
          name: modelName,
          key: key || '',
          provider: 'openrouter',
          addedAt: Date.now(),
        });
        result.rawItemsFound++;
      } else {
        // Update key if missing
        if (key && !result.openRouterEntries[existingIdx].key) {
          result.openRouterEntries[existingIdx].key = key;
        }
      }
    }
  }

  // 2. Global scan for standalone Gemini Keys that were outside formatted blocks
  const globalGeminiMatches = inputText.matchAll(/AIzaSy[a-zA-Z0-9_-]{33}/g);
  for (const m of globalGeminiMatches) {
    const k = m[0];
    if (!result.geminiKeys.includes(k)) {
      result.geminiKeys.push(k);
      result.rawItemsFound++;
    }
  }

  return result;
}

/**
 * Removes a specific model's block from the raw smart paste text
 */
export function removeModelFromSmartText(inputText: string, modelIdToRemove: string): string {
  if (!inputText) return '';
  const blocks = inputText.split(/(?:-{3,}|\*{3,}|={3,})/);
  const filteredBlocks = blocks.filter(block => {
    const trimmed = block.trim();
    if (!trimmed) return false;
    const idMatch = trimmed.match(/(?:id|model|model_id)\s*[:=]\s*(.+)/i);
    if (idMatch && idMatch[1].trim() === modelIdToRemove) {
      return false;
    }
    return true;
  });

  return filteredBlocks.map(b => b.trim()).filter(Boolean).join('\n--------------------------------------------\n');
}
