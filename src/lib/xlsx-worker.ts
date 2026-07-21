import { parseAnyWorkbook } from "@/lib/xlsx-parser";

self.onmessage = (e: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data;
  try {
    const result = parseAnyWorkbook(buffer);
    self.postMessage({ id, result });
  } catch (err: unknown) {
    self.postMessage({ id, error: (err as Error)?.message ?? "Parse error" });
  }
};
