export function createShutdown(options: {
  beginDrain: () => void;
  closeServer: () => Promise<void>;
  closePool: () => Promise<void>;
  forceExit: () => void;
  drainMs: number;
  deadlineMs: number;
}) {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    options.beginDrain();
    const deadline = setTimeout(options.forceExit, options.deadlineMs);
    pending = (async () => {
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, options.drainMs));
        // Stop accepting requests and finish active handlers before ending their shared pool.
        await options.closeServer();
        await options.closePool();
      } finally {
        clearTimeout(deadline);
      }
    })();
    return pending;
  };
}
