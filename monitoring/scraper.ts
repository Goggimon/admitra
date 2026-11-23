import type { MonitoredSource } from './sources.ts';

export interface ScrapedResult {
  ok: boolean;
  httpStatus: string;
  adapter: string;
  normalizedText: string;
  excerpt: string;
  error: string | null;
}

export function stripHtmlNoise(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
}

export function htmlToPlainText(html: string): string {
  return stripHtmlNoise(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function detectAccessBlock(statusCode: number, rawBody: string): { blocked: boolean; reason: string } {
  if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
    return { blocked: true, reason: `HTTP_${statusCode}` };
  }
  const lower = rawBody.toLowerCase();
  if (
    lower.includes('cf-challenge') ||
    (lower.includes('captcha') && lower.includes('verify you are human')) ||
    (lower.includes('access denied') && lower.length < 4000)
  ) {
    return { blocked: true, reason: 'BOT_OR_CAPTCHA_CHALLENGE' };
  }
  return { blocked: false, reason: '' };
}

export function parseUnswAdmissionsHtml(rawHtml: string): { normalizedText: string; excerpt: string } {
  const lines = htmlToPlainText(rawHtml).split('\n').map((l) => l.trim()).filter(Boolean);
  const relevant: string[] = [];
  let inDateSection = false;

  for (const line of lines) {
    if (/202[6-9]\s+application\s+dates/i.test(line) || /Term\s+[1-3]\s+202[6-9]/i.test(line)) {
      inDateSection = true;
    }
    if (inDateSection) {
      relevant.push(line);
      if (/Indicative application processing times/i.test(line) || relevant.length >= 80) {
        inDateSection = false;
      }
    } else if (/applications?\s+to\s+study\s+at\s+unsw.*(open|closed|deadline)/i.test(line)) {
      relevant.push(line);
    }
  }

  const normalized = (relevant.length > 0 ? relevant : lines.slice(0, 60)).join('\n');
  return { normalizedText: normalized, excerpt: normalized.slice(0, 1200) };
}

export function parseJeeMainNoticesHtml(rawHtml: string): { normalizedText: string; excerpt: string } {
  const cleaned = stripHtmlNoise(rawHtml);
  const notices: Array<{ title: string; href: string }> = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(cleaned)) !== null) {
    const href = match[1].trim();
    const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      title.length >= 20 &&
      /(jee|joint entrance|application|registration|admit card|correction|answer key|result|score|schedule|public notice|advisory|counselling)/i.test(title)
    ) {
      notices.push({ title, href });
    }
  }

  const plainText = htmlToPlainText(rawHtml);
  const lastUpdatedMatch = plainText.match(/Last Updated:\s*([A-Za-z0-9,\s-]+)/i);
  const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1].trim() : '';

  const seen = new Set<string>();
  const deduped = notices.filter((n) => {
    const k = n.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const lines = deduped.slice(0, 25).map((n) => `${n.title} | ${n.href}`);
  if (lastUpdated) lines.unshift(`LAST_UPDATED: ${lastUpdated}`);

  const normalized = lines.length > 0 ? lines.join('\n') : plainText.slice(0, 2000);
  return { normalizedText: normalized, excerpt: normalized.slice(0, 1200) };
}

export function parseByAdapter(adapter: MonitoredSource['adapter'], rawHtml: string): { normalizedText: string; excerpt: string } {
  if (adapter === 'unsw_intl_admissions') return parseUnswAdmissionsHtml(rawHtml);
  if (adapter === 'jee_main_public_notices') return parseJeeMainNoticesHtml(rawHtml);
  const text = htmlToPlainText(rawHtml).slice(0, 4000);
  return { normalizedText: text, excerpt: text.slice(0, 1200) };
}

export async function fetchAndScrapeSource(source: MonitoredSource, timeoutMs = 15000): Promise<ScrapedResult> {
  try {
    const res = await fetch(source.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'ADMITRA-Personal-Admissions-Monitor/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const rawBody = await res.text();
    const block = detectAccessBlock(res.status, rawBody);
    if (!res.ok || block.blocked) {
      return {
        ok: false,
        httpStatus: block.blocked ? block.reason : String(res.status),
        adapter: source.adapter,
        normalizedText: '',
        excerpt: '',
        error: block.blocked ? `Access blocked: ${block.reason}` : `HTTP ${res.status}`
      };
    }

    const parsed = parseByAdapter(source.adapter, rawBody);
    if (!parsed.normalizedText || parsed.normalizedText.length < 20) {
      return {
        ok: false,
        httpStatus: String(res.status),
        adapter: source.adapter,
        normalizedText: '',
        excerpt: '',
        error: 'Unexpected empty or minimal content extracted'
      };
    }

    return {
      ok: true,
      httpStatus: String(res.status),
      adapter: source.adapter,
      normalizedText: parsed.normalizedText,
      excerpt: parsed.excerpt,
      error: null
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 'ERR_FETCH',
      adapter: source.adapter,
      normalizedText: '',
      excerpt: '',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
