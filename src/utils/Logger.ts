/**
 * Simple logging utility for the application
 */
export class Logger {
  private readonly context: string;
  public outputTarget: 'stdout' | 'stderr';

  constructor(context: string = 'App', options?: { outputTarget?: 'stdout' | 'stderr' }) {
    this.context = context;
    this.outputTarget = options?.outputTarget || 'stdout';
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      const output = this.outputTarget === 'stderr' ? console.error : console.debug;
      output(`[DEBUG] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      const output = this.outputTarget === 'stderr' ? console.error : console.info;
      output(`[INFO] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'test') {
      const output = this.outputTarget === 'stderr' ? console.error : console.warn;
      output(`[WARN] [${this.context}] ${message}`, ...args);
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
    return new Logger(`${this.context}:${childContext}`, { outputTarget: this.outputTarget });
  }
}
