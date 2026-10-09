/**
 * Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
 * The bot token is only ever used to build the request URL and is redacted
 * from every error message.
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiBase?: string;
}

export interface SendResult {
  messageId: number;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds to wait before retrying (429). */
    readonly retryAfter: number | null,
    /** True when retrying cannot help (bad token, chat not found…). */
    readonly permanent: boolean,
    /** True when the failure concerns the photo (fallback to text is possible). */
    readonly photoProblem: boolean,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export function telegramConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("[REDACTED]").replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, "bot[REDACTED]");
}

export class TelegramClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly cfg: TelegramConfig) {
    this.fetchImpl = cfg.fetchImpl ?? ((...a) => fetch(...a));
  }

  private async call(method: string, body: Record<string, unknown>): Promise<SendResult> {
    const base = this.cfg.apiBase ?? "https://api.telegram.org";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/bot${this.cfg.botToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.cfg.chatId, ...body }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new TelegramError(redact(`Telegram injoignable : ${(err as Error).message}`, this.cfg.botToken), 0, null, false, false);
    } finally {
      clearTimeout(timer);
    }
    let json: { ok?: boolean; result?: { message_id?: number }; description?: string; parameters?: { retry_after?: number } } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      // Non-JSON response (proxy error page…)
    }
    if (res.ok && json.ok && typeof json.result?.message_id === "number") return { messageId: json.result.message_id };

    const description = redact(json.description ?? `HTTP ${res.status}`, this.cfg.botToken);
    const retryAfter = json.parameters?.retry_after ?? null;
    const photoProblem = /wrong file identifier|failed to get http url content|wrong type of the web page content|photo|IMAGE_PROCESS_FAILED|WEBPAGE_/i.test(description);
    const permanent = res.status === 401 || res.status === 403 || res.status === 404 || (res.status === 400 && !photoProblem);
    throw new TelegramError(`Telegram ${method} : ${description}`, res.status, retryAfter, permanent, photoProblem);
  }

  sendMessage(html: string, previewUrl?: string | null): Promise<SendResult> {
    return this.call("sendMessage", {
      text: html.slice(0, 4096),
      parse_mode: "HTML",
      link_preview_options: previewUrl ? { url: previewUrl, prefer_large_media: true, show_above_text: true } : { is_disabled: true },
    });
  }

  sendPhoto(photoUrl: string, captionHtml: string): Promise<SendResult> {
    return this.call("sendPhoto", { photo: photoUrl, caption: captionHtml, parse_mode: "HTML" });
  }

  /**
   * Sends a deal message: as a photo with caption when an image is available
   * and the caption fits (1024 chars), otherwise as text. If Telegram cannot
   * fetch the image, falls back to plain text once.
   */
  async sendDeal(html: string, imageUrl: string | null, sendImages = true): Promise<SendResult> {
    if (imageUrl && sendImages && html.length <= 1024) {
      try {
        return await this.sendPhoto(imageUrl, html);
      } catch (err) {
        if (!(err instanceof TelegramError) || !err.photoProblem) throw err;
      }
    }
    return this.sendMessage(html, null);
  }
}
