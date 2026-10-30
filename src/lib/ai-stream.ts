import { isSafeRelativePath } from "./paths";

type JsonString = { value: string; end: number; complete: boolean };

function readJsonString(source: string, start: number): JsonString | null {
  if (source[start] !== '"') return null;
  let value = "";
  for (let index = start + 1; index < source.length; index++) {
    const character = source[index]!;
    if (character === '"') return { value, end: index + 1, complete: true };
    if (character !== "\\") {
      value += character;
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) break;
    const escapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    if (escaped === "u") {
      const hex = source.slice(index + 2, index + 6);
      if (hex.length < 4 || !/^[\da-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    if (!(escaped in escapes)) break;
    value += escapes[escaped]!;
    index++;
  }
  return { value, end: source.length, complete: false };
}

function skipWhitespace(source: string, start: number) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index++;
  return index;
}

function readPartialEdits(source: string) {
  let index = skipWhitespace(source, 0);
  if (source[index] !== "{") return [];
  index++;
  while (index < source.length) {
    index = skipWhitespace(source, index);
    if (source[index] === "}") return [];
    const key = readJsonString(source, index);
    if (!key?.complete) return [];
    index = skipWhitespace(source, key.end);
    if (source[index] !== ":") return [];
    index = skipWhitespace(source, index + 1);
    if (key.value === "edits") break;
    if (source[index] === '"') {
      const value = readJsonString(source, index);
      if (!value) return [];
      index = value.end;
      if (!value.complete) return [];
    } else {
      while (index < source.length && source[index] !== "," && source[index] !== "}") index++;
    }
    index = skipWhitespace(source, index);
    if (source[index] === ",") index++;
  }
  if (source[index] !== "[") return [];
  index++;

  const edits: { path?: string; action?: string; content?: string }[] = [];
  while (index < source.length) {
    index = skipWhitespace(source, index);
    if (source[index] === "]") break;
    if (source[index] === ",") {
      index++;
      continue;
    }
    if (source[index] !== "{") break;
    index++;
    const edit: { path?: string; action?: string; content?: string } = {};
    while (index < source.length) {
      index = skipWhitespace(source, index);
      if (source[index] === "}") {
        index++;
        break;
      }
      const key = readJsonString(source, index);
      if (!key?.complete) {
        if (edit.action === "write" && edit.path && edit.content !== undefined)
          edits.push(edit);
        return edits;
      }
      index = skipWhitespace(source, key.end);
      if (source[index] !== ":") break;
      index = skipWhitespace(source, index + 1);
      if (source[index] === '"') {
        const value = readJsonString(source, index);
        if (!value) break;
        if (key.value === "path") edit.path = value.value;
        if (key.value === "action") edit.action = value.value;
        if (key.value === "content") {
          edit.content = value.value;
          if (!value.complete) {
            if (edit.action === "write" && edit.path) edits.push(edit);
            return edits;
          }
        }
        index = value.end;
      } else {
        while (index < source.length && source[index] !== "," && source[index] !== "}") index++;
      }
      index = skipWhitespace(source, index);
      if (source[index] === ",") index++;
      else if (source[index] !== "}") break;
    }
    if (edit.action === "write" && edit.path && edit.content !== undefined) edits.push(edit);
  }
  return edits;
}

export function extractStreamingWrites(source: string) {
  return readPartialEdits(source).flatMap((edit) =>
    edit.path && edit.action === "write" && edit.content !== undefined && isSafeRelativePath(edit.path)
      ? [{ path: edit.path, content: edit.content }]
      : [],
  );
}

export function extractStreamingReply(source: string) {
  let index = skipWhitespace(source, 0);
  if (source[index] !== "{") return "";
  index++;
  while (index < source.length) {
    index = skipWhitespace(source, index);
    const key = readJsonString(source, index);
    if (!key?.complete) return "";
    index = skipWhitespace(source, key.end);
    if (source[index] !== ":") return "";
    index = skipWhitespace(source, index + 1);
    if (key.value === "reply") return readJsonString(source, index)?.value ?? "";
    if (source[index] === '"') {
      const value = readJsonString(source, index);
      if (!value) return "";
      index = value.end;
      if (!value.complete) return "";
    } else {
      while (index < source.length && source[index] !== "," && source[index] !== "}") index++;
    }
    index = skipWhitespace(source, index);
    if (source[index] === ",") index++;
    else if (source[index] === "}") return "";
  }
  return "";
}

export function firstCodeBlock(source: string) {
  const start = source.indexOf("```");
  if (start < 0) return null;
  const headerEnd = source.indexOf("\n", start + 3);
  if (headerEnd < 0) return null;
  const end = source.indexOf("```", headerEnd + 1);
  return {
    language: source.slice(start + 3, headerEnd).trim().split(/\s+/)[0] ?? "",
    content: source.slice(headerEnd + 1, end < 0 ? undefined : end).replace(/\n$/, ""),
  };
}
