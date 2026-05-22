import { describe, expect, test, vi } from "vite-plus/test";
import { detectDriver, extractClient } from "../src/extract.ts";

describe("extractClient", () => {
  test("returns session client when present", () => {
    const client = { id: "pool" };
    const db = { session: { client } } as never;

    expect(extractClient(db)).toBe(client);
  });

  test("returns undefined when session is missing", () => {
    const db = {} as never;

    expect(extractClient(db)).toBeUndefined();
  });
});

describe("detectDriver", () => {
  test('returns "unknown" when session is missing', () => {
    expect(detectDriver({} as never)).toBe("unknown");
  });

  test('returns "pg" when session has query', () => {
    const db = { session: { client: {}, query: {} } } as never;
    expect(detectDriver(db)).toBe("pg");
  });

  test('returns "pg" when client exposes query()', () => {
    const db = {
      session: { client: { query: vi.fn() } },
    } as never;
    expect(detectDriver(db)).toBe("pg");
  });

  test('returns "mysql" when session has execute', () => {
    const db = { session: { client: {}, execute: {} } } as never;
    expect(detectDriver(db)).toBe("mysql");
  });

  test('returns "mysql" when client exposes execute()', () => {
    const db = {
      session: { client: { execute: vi.fn() } },
    } as never;
    expect(detectDriver(db)).toBe("mysql");
  });

  test('returns "sqlite" when session has run', () => {
    const db = { session: { client: {}, run: {} } } as never;
    expect(detectDriver(db)).toBe("sqlite");
  });

  test('returns "sqlite" when session has syncRun', () => {
    const db = { session: { client: {}, syncRun: {} } } as never;
    expect(detectDriver(db)).toBe("sqlite");
  });

  test('returns "sqlite" when client exposes prepare()', () => {
    const db = {
      session: { client: { prepare: vi.fn() } },
    } as never;
    expect(detectDriver(db)).toBe("sqlite");
  });

  test("prefers mysql over pg when both session markers exist", () => {
    const db = {
      session: { client: {}, query: {}, execute: {} },
    } as never;
    expect(detectDriver(db)).toBe("mysql");
  });

  test('returns "mysql" when client exposes both query() and execute() (mysql2)', () => {
    const db = {
      session: { client: { query: vi.fn(), execute: vi.fn() } },
    } as never;
    expect(detectDriver(db)).toBe("mysql");
  });
});
