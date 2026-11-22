import { describe, expect, test } from "bun:test";
import { restRequest } from "./rest.ts";

describe("rest tool plugin", () => {
  test("rejects blocked loopback and private hosts", async () => {
    await expect(restRequest({ url: "http://localhost:3000/api/health" })).rejects.toThrow(
      "That host is not allowed",
    );
    await expect(restRequest({ url: "http://127.0.0.1:8080" })).rejects.toThrow(
      "That host is not allowed",
    );
    await expect(restRequest({ url: "http://192.168.1.1" })).rejects.toThrow(
      "Private network hosts are not allowed",
    );
    await expect(restRequest({ url: "http://10.0.0.1" })).rejects.toThrow(
      "Private network hosts are not allowed",
    );
  });

  test("rejects invalid protocols", async () => {
    await expect(restRequest({ url: "ftp://example.com" })).rejects.toThrow(
      "Only http/https URLs are allowed",
    );
    await expect(restRequest({ url: "file:///etc/passwd" })).rejects.toThrow(
      "Only http/https URLs are allowed",
    );
  });

  test("rejects invalid HTTP methods", async () => {
    await expect(
      restRequest({ url: "https://example.com", method: "FOOBAR" }),
    ).rejects.toThrow("Unsupported method: FOOBAR");
  });
});
