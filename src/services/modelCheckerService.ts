import { OpenRouterModelEntry } from '../types';

/**
 * Validates whether an OpenRouter model and its specific API key are working and have quota
 */
export async function checkSingleOpenRouterModel(
  modelId: string,
  apiKey: string
): Promise<{ ok: boolean; status: 'active' | 'error'; message: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, status: 'error', message: 'ไม่มี API Key' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'http://localhost:3000/',
        'X-Title': 'Freebuff Manga Studio Health Checker'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { ok: true, status: 'active', message: 'พร้อมใช้งาน (Online)' };
    }

    const errText = await response.text();
    let parsedErr = errText;
    try {
      const json = JSON.parse(errText);
      parsedErr = json.error?.message || errText;
    } catch {}

    if (response.status === 429) {
      return { ok: false, status: 'error', message: 'หมดโควตา / ติด Rate Limit' };
    }
    if (response.status === 402) {
      return { ok: false, status: 'error', message: 'เครดิตไม่เพียงพอ / โควตาหมด' };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 'error', message: 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์' };
    }
    if (response.status === 404) {
      return { ok: false, status: 'error', message: 'ไม่พบโมเดลนี้บน OpenRouter' };
    }

    return { ok: false, status: 'error', message: `ไม่ตอบสนอง (${response.status}): ${parsedErr.slice(0, 50)}` };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 'error', message: 'หมดเวลาเชื่อมต่อ (Timeout)' };
    }
    return { ok: false, status: 'error', message: err.message || 'เชื่อมต่อไม่สำเร็จ' };
  }
}

/**
 * Checks all OpenRouter model entries in batches
 */
export async function checkAllOpenRouterModelsHealth(
  entries: OpenRouterModelEntry[],
  onProgress?: (updatedList: OpenRouterModelEntry[]) => void
): Promise<OpenRouterModelEntry[]> {
  const list = [...entries];

  // Check 4 models concurrently
  const BATCH_SIZE = 4;
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE);

    // Mark current chunk as checking
    for (let j = 0; j < chunk.length; j++) {
      list[i + j] = { ...list[i + j], status: 'checking' };
    }
    if (onProgress) onProgress([...list]);

    await Promise.all(
      chunk.map(async (entry, chunkIdx) => {
        const actualIdx = i + chunkIdx;
        const result = await checkSingleOpenRouterModel(entry.id, entry.key);
        list[actualIdx] = {
          ...list[actualIdx],
          status: result.status,
          statusMessage: result.message,
          lastCheckedAt: Date.now()
        };
      })
    );

    if (onProgress) onProgress([...list]);
  }

  return list;
}
