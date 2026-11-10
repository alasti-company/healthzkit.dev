import { ServiceBusAdministrationClient } from "@azure/service-bus";
import { expect, test, vi } from "vite-plus/test";
import { azureServiceBusAdapter } from "../src/index.ts";

test("real SDK forwards the abort signal through the management HTTP pipeline", async () => {
  const sendRequest = vi.fn(
    async (request: {
      url: string;
      abortSignal?: {
        aborted: boolean;
        addEventListener: (name: "abort", listener: () => void) => void;
      };
    }) => {
      expect(request.url).toContain("/orders?api-version=");
      expect(request.abortSignal).toBeDefined();
      return new Promise<never>((_resolve, reject) => {
        request.abortSignal!.addEventListener("abort", () =>
          reject(new Error("HTTP request aborted")),
        );
      });
    },
  );
  const client = new ServiceBusAdministrationClient(
    "Endpoint=sb://example.servicebus.windows.net/;SharedAccessKeyName=manage;SharedAccessKey=a2V5",
    { retryOptions: { maxRetries: 0 } },
  );
  client.pipeline.addPolicy({ name: "test-transport", sendRequest });
  const result = await azureServiceBusAdapter({
    client,
    queueName: "orders",
    operationTimeoutMs: 50,
  }).check();
  expect(result.status).toBe("fail");
  expect(sendRequest, String(result.error)).toHaveBeenCalledOnce();
  expect(sendRequest.mock.calls[0]![0].abortSignal?.aborted).toBe(true);
});
