/**
 * Adapter to allow switching between chokidar and fs.watch implementations
 */

export interface WatcherOptions {
  persistent?: boolean;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  depth?: number;
  awaitWriteFinish?: boolean | {
    stabilityThreshold?: number;
    pollInterval?: number;
  };
  ignorePermissionErrors?: boolean;
  atomic?: boolean | number;
}

export interface WatcherAdapter {
  watch(path: string | string[], options?: WatcherOptions): void;
  on(event: string, callback: Function): void;
  close(): void;
  unwatch?(path: string): void;
}

// Feature flag to switch implementations
export const USE_FS_WATCH = process.env.CCCONTEXT_USE_FS_WATCH === "true";

export async function createFileWatcher(
  paths: string | string[],
  options?: WatcherOptions
): Promise<WatcherAdapter> {
  if (USE_FS_WATCH) {
    // Use lightweight fs.watch implementation
    const { createWatcher } = await import("../utils/file-watcher.js");
    const watcher = createWatcher(paths, options);
    
    // Wrap to match the interface
    return {
      watch: (_path: string | string[], _options?: WatcherOptions) => {
        // Already watching from createWatcher
      },
      on: (event: string, callback: Function) => (watcher as any).on(event, callback),
      close: () => watcher.close(),
      unwatch: (path: string) => watcher.unwatch(path),
    };
  } else {
    // Use chokidar (default for now)
    const chokidar = await import("chokidar");
    const watcher = chokidar.default.watch(paths, options);
    
    // Wrap to match the interface
    return {
      watch: (path: string | string[], _opts?: WatcherOptions) => watcher.add(path),
      on: (event: string, callback: Function) => (watcher as any).on(event, callback),
      close: () => watcher.close(),
      unwatch: (path: string) => watcher.unwatch(path),
    };
  }
}