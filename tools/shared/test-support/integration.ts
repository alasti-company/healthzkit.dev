import { createServer } from "node:net";

export function serviceUrl(name: string): string {
  const value = process.env[`HEALTHZKIT_${name}_URL`];
  if (!value) throw new Error(`Set HEALTHZKIT_${name}_URL for integration tests`);
  return value;
}

// Reserve an OS-assigned port rather than assuming a hard-coded port is unused.
export async function refusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  return address.port;
}
