import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: string;
  source?: string;
}

const STORAGE_KEY = '@erebus_error_logs';
const MAX_LOGS = 500;

class ErrorLogger {
  private logs: LogEntry[] = [];
  private isInitialized = false;
  private listeners: Set<() => void> = new Set();

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
      this.isInitialized = true;
      this.setupGlobalHandlers();
    } catch (e) {
      console.error('Failed to load error logs:', e);
      this.isInitialized = true;
    }
  }

  private setupGlobalHandlers(): void {
    if (typeof window === 'undefined' && Platform.OS === 'web') {
      return;
    }

    try {
      const originalConsoleError = console.error;
      console.error = (...args: any[]) => {
        this.error(args.map(a => this.stringify(a)).join(' '), 'console.error');
        originalConsoleError.apply(console, args);
      };

      const originalConsoleWarn = console.warn;
      console.warn = (...args: any[]) => {
        this.warn(args.map(a => this.stringify(a)).join(' '), 'console.warn');
        originalConsoleWarn.apply(console, args);
      };
    } catch (e) {
      // Console patching failed, continue without it
    }

    if (Platform.OS !== 'web') {
      try {
        if (typeof ErrorUtils !== 'undefined' && ErrorUtils.getGlobalHandler) {
          const originalHandler = ErrorUtils.getGlobalHandler();
          ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
            this.error(
              `${isFatal ? 'FATAL: ' : ''}${error.message}`,
              'GlobalErrorHandler',
              error.stack
            );
            if (originalHandler) {
              originalHandler(error, isFatal);
            }
          });
        }
      } catch (e) {
        // ErrorUtils not available, continue without it
      }
    }

    try {
      if (typeof global !== 'undefined') {
        const originalPromiseRejection = (global as any).onunhandledrejection;
        (global as any).onunhandledrejection = (event: any) => {
          const reason = event?.reason || 'Unknown rejection';
          this.error(
            `Unhandled Promise Rejection: ${this.stringify(reason)}`,
            'PromiseRejection'
          );
          if (originalPromiseRejection) {
            originalPromiseRejection(event);
          }
        };
      }
    } catch (e) {
      // Promise rejection handling setup failed, continue without it
    }
  }

  private stringify(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async addLog(level: LogLevel, message: string, source?: string, details?: string): Promise<void> {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      message: message.substring(0, 1000),
      source,
      details: details?.substring(0, 2000),
    };

    this.logs.unshift(entry);
    
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }

    this.notifyListeners();

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.log('Failed to persist logs:', e);
    }
  }

  debug(message: string, source?: string, details?: string): void {
    this.addLog('debug', message, source, details);
  }

  info(message: string, source?: string, details?: string): void {
    this.addLog('info', message, source, details);
  }

  warn(message: string, source?: string, details?: string): void {
    this.addLog('warn', message, source, details);
  }

  error(message: string, source?: string, details?: string): void {
    this.addLog('error', message, source, details);
  }

  logApiError(endpoint: string, error: any, requestData?: any): void {
    const message = `API Error: ${endpoint}`;
    const details = JSON.stringify({
      error: error?.message || this.stringify(error),
      status: error?.status,
      request: requestData,
    }, null, 2);
    this.error(message, 'API', details);
  }

  logApiRequest(method: string, endpoint: string, status: number, duration: number): void {
    this.info(
      `${method} ${endpoint} - ${status} (${duration}ms)`,
      'API'
    );
  }

  getLogs(filter?: LogLevel): LogEntry[] {
    if (filter) {
      return this.logs.filter(log => log.level === filter);
    }
    return [...this.logs];
  }

  getErrorCount(): number {
    return this.logs.filter(log => log.level === 'error').length;
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
    this.notifyListeners();
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.log('Failed to clear logs:', e);
    }
  }

  exportLogs(): string {
    const deviceInfo = {
      platform: Platform.OS,
      version: Platform.Version,
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify({
      deviceInfo,
      logs: this.logs,
    }, null, 2);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

export const errorLogger = new ErrorLogger();

export default errorLogger;
