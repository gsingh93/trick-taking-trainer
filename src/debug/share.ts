import type { BidState } from "@/engine/phase/bidding";
import type { GameState } from "@/engine/state";
import type { TrumpConfig } from "@/engine/types";

export type SharePayload = {
  v: 1;
  seed: number;
  aiMode: "random" | "bidding";
  trump: TrumpConfig;
  game: GameState;
  bidState: BidState | null;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const response = new Response(stream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const compressed = stream.pipeThrough(new CompressionStream("gzip"));
  return streamToBytes(compressed);
}

async function decompressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return bytes;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
  return streamToBytes(decompressed);
}

export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = textEncoder.encode(json);
  const compressed = await compressBytes(bytes);
  return toBase64Url(compressed);
}

export async function decodeSharePayload(encoded: string): Promise<SharePayload | null> {
  try {
    const bytes = fromBase64Url(encoded);
    const decompressed = await decompressBytes(bytes);
    const json = textDecoder.decode(decompressed);
    const parsed = JSON.parse(json) as SharePayload;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}
