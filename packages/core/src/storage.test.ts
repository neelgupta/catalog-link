import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isZip, LocalStorage, sniffImage } from "./storage";

describe("LocalStorage", async () => {
  const root = await mkdtemp(join(tmpdir(), "cl-storage-"));
  const storage = new LocalStorage(root);
  afterAll(() => rm(root, { recursive: true, force: true }));

  it("saves, reads and removes files by key", async () => {
    const url = await storage.save("clients/c1/logo.png", Buffer.from("x"));
    expect(url).toBe("/media/clients/c1/logo.png");
    expect(storage.keyFromUrl(url)).toBe("clients/c1/logo.png");
    expect((await storage.read("clients/c1/logo.png"))?.toString()).toBe("x");
    await storage.remove("clients/c1/logo.png");
    expect(await storage.read("clients/c1/logo.png")).toBeNull();
  });

  it("rejects keys that escape the media root", async () => {
    await expect(storage.save("../outside.txt", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    await expect(storage.save("a/../../outside.txt", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    expect(await storage.read("../../etc/passwd")).toBeNull();
  });

  it("ignores URLs that aren't ours", () => {
    expect(storage.keyFromUrl("https://example.com/logo.png")).toBeNull();
  });
});

describe("file sniffing", () => {
  it("detects images by magic bytes", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"))?.ext).toBe("webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });

  it("detects zip (xlsx)", () => {
    expect(isZip(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(isZip(Buffer.from("plain text"))).toBe(false);
  });
});
