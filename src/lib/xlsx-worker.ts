import { parseAnyWorkbook } from "@/lib/xlsx-parser";

self.onmessage = (e: MessageEvent<{ id: string; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data;
  try {
    const result = parseAnyWorkbook(buffer);
    self.postMessage({ id, result });
  } catch (err: any) {
    self.postMessage({ id, error: err?.message ?? "Parse error" });
  }
};
