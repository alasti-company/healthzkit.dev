import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import { expect, test } from "vite-plus/test";
import type Memcached from "memcached";
import type { Client } from "memjs";
import { memcachedAdapter, memjsAdapter } from "../src/index.ts";

// Exercise the real client libraries against small protocol fixtures, without a daemon.
test.each(["memcached", "memjs"] as const)(
  "%s works with the actual client and wire protocol",
  async (kind) => {
    const sockets = new Set<Socket>();
    const commands: string[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let pending = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        if (kind === "memcached") {
          while (pending.includes("\r\n")) {
            const end = pending.indexOf("\r\n");
            commands.push(pending.subarray(0, end).toString());
            pending = pending.subarray(end + 2);
            socket.write("VERSION 1.6.39\r\n");
          }
        } else {
          while (pending.length >= 24) {
            const length = 24 + pending.readUInt32BE(8);
            if (pending.length < length) break;
            commands.push(pending.subarray(24, length).toString());
            const response = Buffer.alloc(24);
            response[0] = 0x81;
            response[1] = pending[1]!;
            response.writeUInt16BE(1, 6); // GET: key not found is a healthy cache miss.
            pending.copy(response, 12, 12, 16); // Preserve the request's opaque sequence.
            pending = pending.subarray(length);
            socket.write(response);
          }
        }
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const servers = `127.0.0.1:${address.port}`;
    let client: Memcached | Client | undefined;
    try {
      const adapter =
        kind === "memcached"
          ? memcachedAdapter({
              servers,
              metadata: (resolved) => {
                client = resolved;
                return {};
              },
            })
          : memjsAdapter({
              servers,
              metadata: (resolved) => {
                client = resolved;
                return {};
              },
            });
      expect((await adapter.check()).status).toBe("ok");
      expect((await adapter.check()).status).toBe("ok");
      expect(commands).toEqual(
        kind === "memcached"
          ? ["version", "version"]
          : ["healthzkit:healthcheck", "healthzkit:healthcheck"],
      );
    } finally {
      if (client && "end" in client) client.end();
      else client?.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
