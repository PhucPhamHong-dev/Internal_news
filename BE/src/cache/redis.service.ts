import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisClientType, createClient } from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.logger.warn("REDIS_URL is not configured. Redis cache is disabled.");
      return;
    }

    try {
      this.client = createClient({ url });
      this.client.on("error", (error) => {
        this.available = false;
        this.logger.warn(`Redis connection error: ${error.message}`);
      });
      await this.client.connect();
      this.available = true;
    } catch (error) {
      this.available = false;
      const message = error instanceof Error ? error.message : "Unknown Redis error";
      this.logger.warn(`Redis is unavailable: ${message}`);
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  isReady() {
    return this.available && Boolean(this.client?.isOpen);
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isReady() || !this.client) return null;
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    if (!this.isReady() || !this.client) return;
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }

  async del(key: string) {
    if (!this.isReady() || !this.client) return;
    await this.client.del(key);
  }

  async deleteByPrefix(prefix: string) {
    if (!this.isReady() || !this.client) return;
    const keys: string[] = [];

    for await (const key of this.client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      if (typeof key === "string") {
        keys.push(key);
      }
    }

    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}

