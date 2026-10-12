/**
 * Telegram Bot API client for the interactive, self-registering bot: it long-
 * polls getUpdates and answers commands. Delivery of deal alerts reuses the
 * one-shot TelegramClient (see delivery.ts); this class owns the conversation
 * side. The bot token is only ever used to build the request URL and is
 * redacted from every error message.
 */
import { redact, TelegramError } from "./telegram";

export interface TelegramBotConfig {
  botToken: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  /** Per-request timeout; must exceed the long-poll timeout for getUpdates. */
  timeoutMs?: number;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface BotCommand {
  command: string;
  description: string;
}

export class TelegramBot {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly cfg: TelegramBotConfig) {
    this.fetchImpl = cfg.fetchImpl ?? ((...a) => fetch(...a));
  }

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    const base = this.cfg.apiBase ?? "https://api.telegram.org";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.cfg.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/bot${this.cfg.botToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new TelegramError(redact(`Telegram injoignable : ${(err as Error).message}`, this.cfg.botToken), 0, null, false, false);
    } finally {
      clearTimeout(timer);
    }
    let json: { ok?: boolean; result?: unknown; description?: string; parameters?: { retry_after?: number } } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      // Non-JSON response (proxy error page…)
    }
    if (res.ok && json.ok) return json.result as T;
    const description = redact(json.description ?? `HTTP ${res.status}`, this.cfg.botToken);
    const retryAfter = json.parameters?.retry_after ?? null;
    const permanent = res.status === 401 || res.status === 404;
    throw new TelegramError(`Telegram ${method} : ${description}`, res.status, retryAfter, permanent, false);
  }

  getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {});
  }

  /**
   * Long-polls for updates. `offset` is the id of the first update to return
   * (usually lastSeen + 1, which also acknowledges everything before it).
   */
  getUpdates(offset: number, timeoutSeconds = 50): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      "getUpdates",
      { offset, timeout: timeoutSeconds, allowed_updates: ["message"] },
      (timeoutSeconds + 10) * 1000,
    );
  }

  async sendMessage(chatId: string | number, html: string, previewUrl?: string | null): Promise<number> {
    const r = await this.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: html.slice(0, 4096),
      parse_mode: "HTML",
      link_preview_options: previewUrl ? { url: previewUrl } : { is_disabled: true },
    });
    return r.message_id;
  }

  async setMyCommands(commands: BotCommand[]): Promise<void> {
    await this.call("setMyCommands", { commands });
  }
}
