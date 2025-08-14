export type LogLevel = "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  child?(bindings: Record<string, unknown>): Logger;
}

class NoopLogger implements Logger {
  error(message: string, context?: Record<string, unknown>): void {
    void message;
    void context;
  }
  warn(message: string, context?: Record<string, unknown>): void {
    void message;
    void context;
  }
  info(message: string, context?: Record<string, unknown>): void {
    void message;
    void context;
  }
  debug(message: string, context?: Record<string, unknown>): void {
    void message;
    void context;
  }
  child(bindings: Record<string, unknown>): Logger {
    void bindings;
    return this;
  }
}

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export class ConsoleLogger implements Logger {
  private readonly minLevel: LogLevel;
  private readonly name?: string;
  private readonly bindings: Record<string, unknown>;

  constructor(
    options: {
      logLevel?: LogLevel;
      name?: string;
      bindings?: Record<string, unknown>;
    } = {},
  ) {
    const requested = options.logLevel ?? "info";
    this.minLevel = ConsoleLogger.normalizeLevel(requested);
    this.name = options.name;
    this.bindings = { ...(options.bindings ?? {}) };
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      logLevel: this.minLevel,
      name: this.name,
      bindings: { ...this.bindings, ...bindings },
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] <= levelPriority[this.minLevel];
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ) {
    if (!this.shouldLog(level)) return;
    const timestamp = new Date().toISOString();
    const base = this.name
      ? `[${timestamp}] [${this.name}] ${level.toUpperCase()}:`
      : `[${timestamp}] ${level.toUpperCase()}:`;
    const payload = { ...this.bindings, ...(context ?? {}) } as Record<
      string,
      unknown
    >;
    const hasPayload = Object.keys(payload).length > 0;
    const line = `${base} ${message}`;
    const method =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "info"
            ? console.info
            : console.debug;
    if (hasPayload) method(line, payload);
    else method(line);
  }

  private static normalizeLevel(input: unknown): LogLevel {
    if (typeof input === "string") {
      const v = input.toLowerCase().trim();
      if (v === "error" || v === "warn" || v === "info" || v === "debug")
        return v as LogLevel;
      if (v === "warning") return "warn";
      if (v === "verbose" || v === "trace" || v === "silly") return "debug";
      if (v === "fatal") return "error";
      return "info";
    }
    if (typeof input === "number") {
      if (input <= 0) return "error";
      if (input === 1) return "warn";
      if (input === 2) return "info";
      return "debug";
    }
    return "info";
  }
}

export class NullLogger extends NoopLogger {}
