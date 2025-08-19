/**
 * Simple logging utility for the application
 */
export class Logger {
  private readonly context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.debug(`[DEBUG] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[INFO] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[WARN] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[ERROR] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Create child logger with additional context
   */
  child(childContext: string): Logger {
    return new Logger(`${this.context}:${childContext}`);
  }
}
