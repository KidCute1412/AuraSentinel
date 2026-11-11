import { describe, expect, it } from "vitest";

/**
 * Design system "Copy": every user-facing string in the web app is English. Vietnamese belongs in
 * docs and in server data (Explanation.messageVi), never in shipped source. Tests and fixtures are
 * excluded because they may carry server payloads verbatim.
 */
const SOURCES = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

// Letters that only show up in Vietnamese text (the precomposed tone marks plus ă, đ, ơ, ư and accented vowels).
const VIETNAMESE = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/u;

describe("English-only UI copy", () => {
  it("scans the app source", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  it("has no Vietnamese text in shipped source", () => {
    const hits = Object.entries(SOURCES).flatMap(([file, text]) =>
      text
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => VIETNAMESE.test(line))
        .map(({ line, i }) => `${file}:${i + 1}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});
