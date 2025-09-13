import { type FSWatcher, watch } from "fs";
import { join } from "path";
import { debounce } from "./debounce.js";

export interface FileWatcherOptions {
  recursive?: boolean;
  ignoreInitial?: boolean;
  debounceMs?: number;
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  public callbacks: Map<string, Function[]> = new Map();
  private debouncedCallbacks: Map<Function, Function> = new Map();

  watch(path: string, options: FileWatcherOptions = {}, callback: (eventType: string, filename: string) => void): void {
    const { recursive = true, debounceMs = 100 } = options;

    // Create debounced callback
    const debouncedCallback = debounce((...args: unknown[]) => {
      callback(args[0] as string, args[1] as string);
    }, debounceMs);

    this.debouncedCallbacks.set(callback, debouncedCallback);

    try {
      this.watcher = watch(path, { recursive }, (eventType, filename) => {
        if (!filename) return;

        // Filter JSON files
        if (filename.endsWith(".json")) {
          debouncedCallback(eventType as string, filename);
        }
      });

      // Store callbacks for cleanup
      if (!this.callbacks.has(path)) {
        this.callbacks.set(path, []);
      }
      this.callbacks.get(path)?.push(callback);
    } catch (error) {
      console.error("Failed to start file watcher:", error);
      throw error;
    }
  }

  on(event: string, callback: Function): void {
    if (event === "ready" && !this.callbacks.has("ready")) {
      // Emit ready immediately for fs.watch
      setTimeout(() => callback(), 0);
    }

    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)?.push(callback);
  }

  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.callbacks.clear();
    this.debouncedCallbacks.clear();
  }

  unwatch(_path: string): void {
    // fs.watch doesn't support unwatching specific paths
    // We need to close and recreate if needed
    this.close();
  }
}

// Chokidar-compatible interface for easier migration
export function createWatcher(path: string | string[], options?: FileWatcherOptions): FileWatcher {
  const watcher = new FileWatcher();

  if (Array.isArray(path)) {
    // Watch multiple paths
    path.forEach((p) => {
      watcher.watch(p, options, (eventType, filename) => {
        // Emit chokidar-like events
        const callbacks = watcher.callbacks.get("all") || [];
        callbacks.forEach((cb: Function) => {
          cb(eventType, join(p, filename));
        });
      });
    });
  } else {
    watcher.watch(path, options, (eventType, filename) => {
      // Emit chokidar-like events
      const callbacks = watcher.callbacks.get("all") || [];
      callbacks.forEach((cb: Function) => {
        cb(eventType, join(path, filename));
      });
    });
  }

  return watcher;
}
