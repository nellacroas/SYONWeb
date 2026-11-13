(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Errors and locations
  // ---------------------------------------------------------------------------

  class ConvertError extends Error {
    constructor(code, message, line, col, related) {
      super(message);
      this.name = "ConvertError";
      this.code = code;
      this.line = line || 1;
      this.col = col || 1;
      this.related = related || null;
    }
  }

  class Locator {
    constructor(text, line, col) {
      this.text = text;
      this.baseLine = line || 1;
      this.baseCol = col || 1;
    }

    lineCol(pos) {
      let line = this.baseLine;
      let col = this.baseCol;
      for (let i = 0; i < pos && i < this.text.length; i++) {
        if (this.text[i] === "\n") {
          line++;
          col = 1;
        } else {
          col++;
        }
      }
      return { line, col };
    }

    fail(code, message, pos, related) {
      const lc = this.lineCol(pos);
      throw new ConvertError(code, message, lc.line, lc.col, related);
    }
  }

  function fail(code, message, line, col, related) {
    throw new ConvertError(code, message, line, col, related);
  }

  // ---------------------------------------------------------------------------
  // Small text utilities
  // ---------------------------------------------------------------------------

  const BARE_START = /[A-Za-z0-9_]/;
  const BARE_CHAR = /[A-Za-z0-9_-]/;

  function isHSpace(ch) {
    return ch === " " || ch === "\t";
  }

  function skipHSpace(text, pos) {
    while (pos < text.length && isHSpace(text[pos])) pos++;
    return pos;
  }

  function trimHSpace(text) {
    let start = 0;
    let end = text.length;
    while (start < end && isHSpace(text[start])) start++;
    while (end > start && isHSpace(text[end - 1])) end--;
    return text.slice(start, end);
  }

  function leadingHSpace(text) {
    let i = 0;
    while (i < text.length && isHSpace(text[i])) i++;
    return i;
  }

  function isBareStart(ch) {
    return typeof ch === "string" && BARE_START.test(ch);
  }

  function isBareChar(ch) {
    return typeof ch === "string" && BARE_CHAR.test(ch);
  }

  function stripLineComment(text) {
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote === '"') {
        if (ch === "\\") {
          i++;
        } else if (ch === '"') {
          quote = null;
        }
      } else if (quote === "'") {
        if (ch === "'") quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "/" && text[i + 1] === "/") {
        return text.slice(0, i);
      }
    }
    return text;
  }

  function onlyHSpaceOrComment(text, pos) {
    pos = skipHSpace(text, pos);
    return pos >= text.length || (text[pos] === "/" && text[pos + 1] === "/");
  }

  // ---------------------------------------------------------------------------
  // Quoted strings
  // ---------------------------------------------------------------------------

  function hasUnpairedSurrogate(text) {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
        if (next < 0xdc00 || next > 0xdfff) return true;
        i++;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  function parseQuotedStringAt(locator, pos, options) {
    const text = locator.text;
    const startPos = pos;
    const quote = text[pos];
    if (quote !== '"' && quote !== "'") {
      locator.fail("E_VALUE", "Expected a quoted string.", pos);
    }

    const allowMultiline = !!options.allowMultilineStrings;
    let out = "";

    if (quote === "'") {
      pos++;
      while (pos < text.length) {
        const ch = text[pos];
        if (ch === "'") {
          if (hasUnpairedSurrogate(out)) {
            locator.fail("E_VALUE", "String contains an unpaired Unicode surrogate.", startPos);
          }
          return { value: out, pos: pos + 1 };
        }
        if (ch === "\n") {
          if (!allowMultiline) {
            locator.fail("E_VALUE", "A single-quoted string cannot span physical lines here.", pos);
          }
          out += "\n";
          pos++;
          continue;
        }
        const code = ch.charCodeAt(0);
        if (code < 0x20) {
          locator.fail("E_VALUE", "Raw control characters are not allowed in single-quoted strings.", pos);
        }
        // Backslashes are literal in single-quoted strings.
        out += ch;
        pos++;
      }
      locator.fail("E_VALUE", "Unclosed single-quoted string.", pos);
    }

    pos++;
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === '"') {
        if (hasUnpairedSurrogate(out)) {
          locator.fail("E_VALUE", "String contains an unpaired Unicode surrogate.", startPos);
        }
        return { value: out, pos: pos + 1 };
      }
      if (ch === "\\") {
        pos++;
        if (pos >= text.length) {
          locator.fail("E_VALUE", "Unclosed escape sequence in a string.", pos);
        }
        const esc = text[pos];
        switch (esc) {
          case '"': out += '"'; pos++; break;
          case "\\": out += "\\"; pos++; break;
          case "/": out += "/"; pos++; break;
          case "b": out += "\b"; pos++; break;
          case "f": out += "\f"; pos++; break;
          case "n": out += "\n"; pos++; break;
          case "r": out += "\r"; pos++; break;
          case "t": out += "\t"; pos++; break;
          case "u": {
            const hex = text.slice(pos + 1, pos + 5);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
              locator.fail("E_VALUE", "Invalid \\u escape; expected four hex digits.", pos);
            }
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 5;
            break;
          }
          default:
            locator.fail("E_VALUE", "Invalid escape sequence in a double-quoted string.", pos);
        }
        continue;
      }
      if (ch === "\n") {
        if (!allowMultiline) {
          locator.fail("E_VALUE", "A double-quoted string cannot span physical lines here.", pos);
        }
        out += "\n";
        pos++;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        locator.fail("E_VALUE", "Raw control characters are not allowed in double-quoted strings.", pos);
      }
      out += ch;
      pos++;
    }
    locator.fail("E_VALUE", "Unclosed double-quoted string.", pos);
  }

  // ---------------------------------------------------------------------------
  // Key paths
  // ---------------------------------------------------------------------------

  function parseKeySegment(locator, pos) {
    const text = locator.text;
    pos = skipHSpace(text, pos);
    if (pos >= text.length) {
      locator.fail("E_KEY_PATH", "Expected a key segment.", pos);
    }
    const ch = text[pos];
    if (ch === '"' || ch === "'") {
      const q = parseQuotedStringAt(locator, pos, { allowMultilineStrings: false });
      return { segment: { kind: "key", key: q.value, quoted: true }, pos: q.pos };
    }
    if (!isBareStart(ch)) {
      locator.fail("E_KEY_PATH", "Expected a bare or quoted key segment.", pos);
    }
    const start = pos;
    pos++;
    while (pos < text.length && isBareChar(text[pos])) pos++;
    const key = text.slice(start, pos);
    if (key === "_") {
      locator.fail("E_KEY_PATH", 'Standalone "_" is not a valid bare key segment; quote it as "_".', start);
    }
    return {
      segment: { kind: "key", key, quoted: false },
      pos
    };
  }

  function parseKeyPath(locator, pos) {
    const text = locator.text;
    const segments = [];
    for (;;) {
      const parsed = parseKeySegment(locator, pos);
      segments.push(parsed.segment);
      pos = parsed.pos;
      const after = skipHSpace(text, pos);
      if (text[after] === ".") {
        pos = skipHSpace(text, after + 1);
        continue;
      }
      return { segments, pos };
    }
  }

  function parsePathExactly(locator, pos, code) {
    const parsed = parseKeyPath(locator, pos);
    const end = skipHSpace(locator.text, parsed.pos);
    if (end !== locator.text.length) {
      locator.fail(code || "E_KEY_PATH", "Unexpected content after key path.", end);
    }
    return parsed.segments;
  }

  function parseSuffix(locator, pos, allowArray, allowAppend) {
    const text = locator.text;
    pos = skipHSpace(text, pos);
    let marker = null;
    if (text[pos] === "[") {
      if (text.startsWith("[]", pos)) {
        if (!allowArray) {
          locator.fail("E_KEY_PATH", "An array marker is not allowed here.", pos);
        }
        marker = "array";
        pos += 2;
      } else if (text.startsWith("[+]", pos)) {
        if (!allowAppend) {
          locator.fail("E_KEY_PATH", "An append marker is not allowed here.", pos);
        }
        marker = "append";
        pos += 3;
      } else {
        locator.fail("E_KEY_PATH", "Expected [] or [+].", pos);
      }
      pos = skipHSpace(text, pos);
    }
    return { marker, pos };
  }

  // ---------------------------------------------------------------------------
  // Value parser
  // ---------------------------------------------------------------------------

  function makeObject(origin, span) {
    return { kind: "object", obj: new Map(), origin: origin || "navigation", alloc: span || null };
  }
  function makeArray(origin, span) {
    return { kind: "array", arr: [], origin: origin || "navigation", alloc: span || null };
  }
  function makeString(value, origin, span) {
    return { kind: "string", value, origin: origin || "literal", alloc: span || null };
  }
  function makeNumber(value, origin, span) {
    return { kind: "number", value, origin: origin || "literal", alloc: span || null };
  }
  function makeBoolean(value, origin, span) {
    return { kind: "boolean", value: !!value, origin: origin || "literal", alloc: span || null };
  }
  function makeNull(origin, span) {
    return { kind: "null", value: null, origin: origin || "literal", alloc: span || null };
  }

  function cloneNode(node) {
    if (!node) return node;
    switch (node.kind) {
      case "object": {
        const out = makeObject("copy", node.alloc);
        for (const [k, v] of node.obj) out.obj.set(k, cloneNode(v));
        return out;
      }
      case "array": {
        const out = makeArray("copy", node.alloc);
        for (const v of node.arr) out.arr.push(cloneNode(v));
        return out;
      }
      case "string": return makeString(node.value, "copy", node.alloc);
      case "number": return makeNumber(node.value, "copy", node.alloc);
      case "boolean": return makeBoolean(node.value, "copy", node.alloc);
      case "null": return makeNull("copy", node.alloc);
      default: throw new Error("Unknown node kind: " + node.kind);
    }
  }

  function nodeKind(node) {
    return node ? node.kind : "absent";
  }

  function isContainer(node) {
    return !!node && (node.kind === "object" || node.kind === "array");
  }

  function isEmptyContainer(node) {
    if (!node) return false;
    if (node.kind === "object") return node.obj.size === 0;
    if (node.kind === "array") return node.arr.length === 0;
    return false;
  }

  function isNonEmptyContainer(node) {
    if (!node) return false;
    if (node.kind === "object") return node.obj.size > 0;
    if (node.kind === "array") return node.arr.length > 0;
    return false;
  }

  class ValueParser {
    constructor(locator, options) {
      this.loc = locator;
      this.text = locator.text;
      this.pos = 0;
      this.options = options || {};
    }

    skip() {
      const text = this.text;
      for (;;) {
        while (this.pos < text.length && (text[this.pos] === " " || text[this.pos] === "\t" || text[this.pos] === "\n")) {
          this.pos++;
        }
        if (text[this.pos] === "/" && text[this.pos + 1] === "/") {
          this.pos += 2;
          while (this.pos < text.length && text[this.pos] !== "\n") this.pos++;
          continue;
        }
        return;
      }
    }

    parseAll(options) {
      options = options || {};
      this.skip();
      if (this.pos >= this.text.length) {
        this.loc.fail("E_VALUE", "Empty value.", this.pos);
      }
      if (options.rejectContainerStart && (this.text[this.pos] === "{" || this.text[this.pos] === "[")) {
        this.loc.fail("E_VALUE", "A reconstructed object or array value is not allowed here.", this.pos);
      }
      const value = this.parseValue();
      this.skip();
      if (this.pos < this.text.length) {
        this.loc.fail("E_VALUE", "Unexpected trailing content after value.", this.pos);
      }
      return value;
    }

    parseValue() {
      this.skip();
      const ch = this.text[this.pos];
      if (ch === "{") return this.parseObject();
      if (ch === "[") return this.parseArray();
      if (ch === '"' || ch === "'") return this.parseStringConcat();
      if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber();
      if (ch === "t" || ch === "f" || ch === "n") return this.parseWord();
      this.loc.fail("E_VALUE", "Expected a value.", this.pos);
    }

    parseStringConcat() {
      const first = parseQuotedStringAt(this.loc, this.pos, {
        allowMultilineStrings: !!this.options.allowMultilineStrings
      });
      let value = first.value;
      this.pos = first.pos;
      if (!this.options.allowMultilineStrings) {
        return makeString(value);
      }
      for (;;) {
        const beforeSkip = this.pos;
        this.skip();
        const ch = this.text[this.pos];
        if (ch !== '"' && ch !== "'") break;
        if (!this.text.slice(beforeSkip, this.pos).includes("\n")) {
          this.loc.fail("E_VALUE", "String concatenation requires a line break inside a > continuation block.", this.pos);
        }
        const next = parseQuotedStringAt(this.loc, this.pos, {
          allowMultilineStrings: true
        });
        value += next.value;
        this.pos = next.pos;
      }
      return makeString(value);
    }

    parseNumber() {
      const rest = this.text.slice(this.pos);
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
      if (!match) this.loc.fail("E_VALUE", "Invalid JSON number.", this.pos);
      const raw = match[0];
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        this.loc.fail("E_VALUE", "Number is not finite.", this.pos);
      }
      this.pos += raw.length;
      return makeNumber(value);
    }

    parseWord() {
      const rest = this.text.slice(this.pos);
      for (const word of ["true", "false", "null"]) {
        if (rest.startsWith(word)) {
          const after = this.pos + word.length;
          if (after < this.text.length && isBareChar(this.text[after])) {
            this.loc.fail("E_VALUE", "Invalid token after JSON keyword.", after);
          }
          this.pos = after;
          if (word === "true") return makeBoolean(true);
          if (word === "false") return makeBoolean(false);
          return makeNull();
        }
      }
      this.loc.fail("E_VALUE", "Unquoted text is not a value.", this.pos);
    }

    parseObject() {
      this.pos++; // {
      const obj = makeObject("literal");
      this.skip();
      if (this.text[this.pos] === "}") {
        this.pos++;
        return obj;
      }
      for (;;) {
        this.skip();
        const keyStart = this.pos;
        let key;
        let quoted = false;
        if (this.text[this.pos] === '"' || this.text[this.pos] === "'") {
          const q = parseQuotedStringAt(this.loc, this.pos, { allowMultilineStrings: false });
          key = q.value;
          quoted = true;
          this.pos = q.pos;
        } else if (isBareStart(this.text[this.pos])) {
          const start = this.pos;
          this.pos++;
          while (this.pos < this.text.length && isBareChar(this.text[this.pos])) this.pos++;
          key = this.text.slice(start, this.pos);
          if (key === "_") {
            this.loc.fail("E_VALUE", 'Standalone "_" is not a valid bare object member key; quote it as "_".', start);
          }
        } else {
          this.loc.fail("E_VALUE", "Expected an object member name.", this.pos);
        }

        this.skip();
        if (this.text[this.pos] !== ":") {
          this.loc.fail("E_VALUE", "Expected ':' after object member name.", this.pos);
        }
        this.pos++;
        const value = this.parseValue();
        if (obj.obj.has(key)) {
          this.loc.fail("E_DUPLICATE", "Duplicate object member key " + JSON.stringify(key) + ".", keyStart);
        }
        obj.obj.set(key, value);

        this.skip();
        const ch = this.text[this.pos];
        if (ch === "}") {
          this.pos++;
          return obj;
        }
        if (ch !== ",") {
          this.loc.fail("E_VALUE", "Expected ',' or '}' in object.", this.pos);
        }
        this.pos++;
        this.skip();
        if (this.text[this.pos] === "}") {
          this.pos++;
          return obj;
        }
      }
    }

    parseArray() {
      this.pos++; // [
      const arr = makeArray("literal");
      this.skip();
      if (this.text[this.pos] === "]") {
        this.pos++;
        return arr;
      }
      for (;;) {
        arr.arr.push(this.parseValue());
        this.skip();
        const ch = this.text[this.pos];
        if (ch === "]") {
          this.pos++;
          return arr;
        }
        if (ch !== ",") {
          this.loc.fail("E_VALUE", "Expected ',' or ']' in array.", this.pos);
        }
        this.pos++;
        this.skip();
        if (this.text[this.pos] === "]") {
          this.pos++;
          return arr;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  function elem(index) {
    return { kind: "elem", index };
  }

  function pathCanon(path) {
    return JSON.stringify(path.map((s) => (s.kind === "key" ? ["k", s.key] : ["e", s.index])));
  }

  function pathText(path) {
    if (path.length === 0) return "<root>";
    return path
      .map((s) => (s.kind === "key" ? JSON.stringify(s.key) : "[+]"))
      .join(".");
  }

  function isPathPrefix(a, b) {
    if (a.length > b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].kind !== b[i].kind) return false;
      if (a[i].kind === "key") {
        if (a[i].key !== b[i].key) return false;
      } else if (a[i].index !== b[i].index) {
        return false;
      }
    }
    return true;
  }

  function pathsEqual(a, b) {
    return a.length === b.length && isPathPrefix(a, b);
  }

  function ancestorsInclusive(path) {
    const out = [];
    for (let i = 0; i <= path.length; i++) out.push(path.slice(0, i));
    return out;
  }

  function concatPath(a, b) {
    return a.concat(b);
  }

  function keysToPath(segments) {
    return segments.map((s) => ({ kind: "key", key: s.key }));
  }

  // ---------------------------------------------------------------------------
  // Document / builder
  // ---------------------------------------------------------------------------

  class PatchState {
    constructor() {
      this.frames = [null];
      this.activePath = [];
      this.activeSpan = null;
      this.closed = new Map();
      this.sealed = new Map();
      this.finalTargets = new Map();
      this.block = { kind: "none" };
      this.cursorPath = [];
      this.cursorKind = "unset";
    }
  }

  function freshGroup() {
    return {
      rootCells: null,
      mask: null,
      ordinaryCount: 0,
      previousCells: null
    };
  }

  class Builder {
    constructor(lines) {
      this.lines = lines;
      this.doc = {
        root: null,
        rootKind: "absent",
        assigned: new Map(),
        sawAnyWrite: false,
        sawHeading: false,
        sawBoundary: false
      };
      this.patch = new PatchState();
      this.index = 0;
    }

    // ---- source loop -------------------------------------------------------

    run() {
      while (this.index < this.lines.length) {
        const raw = this.lines[this.index];
        const indent = leadingHSpace(raw);
        let content = raw.slice(indent);
        const line = this.index + 1;

        if (content === "" || content.startsWith("//")) {
          this.index++;
          continue;
        }

        const stripped = stripLineComment(content);
        const boundaryCode = trimHSpace(stripped);
        if (boundaryCode === "---") {
          this.patchBoundary();
          this.index++;
          continue;
        }

        if (content[0] === "#") {
          this.handleHeadingLine(content, line, indent);
          this.index++;
          continue;
        }

        if (content.startsWith("***")) {
          const code = trimHSpace(stripLineComment(content));
          if (code !== "***") {
            fail("E_BLOCK", "Malformed table group separator.", line, indent + 1);
          }
          this.groupReset(line, indent + 1);
          this.index++;
          continue;
        }

        if (content[0] === "*") {
          if (content[1] !== " ") {
            fail("E_SYNTAX", "A schema marker must be followed by exactly one ASCII space.", line, indent + 2);
          }
          const schema = this.parseSchema(content.slice(2), line, indent + 3);
          this.applySchema(schema, line, indent + 1);
          this.index++;
          continue;
        }

        if (content[0] === "+") {
          if (content[1] !== " ") {
            fail("E_SYNTAX", "An array row marker must be followed by exactly one ASCII space.", line, indent + 2);
          }
          this.arrayRow(content.slice(2), line, indent + 3);
          this.index++;
          continue;
        }

        if (content[0] === "-") {
          if (content[1] === " ") {
            this.objectRow(content.slice(2), line, indent + 3);
            this.index++;
            continue;
          }
          if (this.patch.block.kind === "object-table" || content[1] === "\t") {
            fail("E_SYNTAX", "An object-map row marker must be followed by exactly one ASCII space.", line, indent + 2);
          }
        }

        // Field, declaration, append, or bare root value.
        this.index = this.handleValueStatement(content, line, indent);
      }
    }

    // ---- document state helpers -------------------------------------------

    patchBoundary() {
      this.doc.sawBoundary = true;
      const root = this.doc.root;
      this.patch = new PatchState();
      this.patch.cursorPath = [];
      this.patch.cursorKind = root ? root.kind : "unset";
      this.patch.block = { kind: "none" };
    }

    markWrite() {
      this.doc.sawAnyWrite = true;
    }

    ensureRootObject(origin, span) {
      if (!this.doc.root) {
        this.doc.root = makeObject(origin || "navigation", span);
        this.doc.rootKind = "object";
        this.markWrite();
      } else if (this.doc.root.kind !== "object") {
        fail("E_SHAPE", "The root is not an object.", span ? span.line : 1, span ? span.col : 1);
      }
      return this.doc.root;
    }

    ensureRootArray(origin, span) {
      if (!this.doc.root) {
        this.doc.root = makeArray(origin || "heading", span);
        this.doc.rootKind = "array";
        this.markWrite();
      } else if (this.doc.root.kind !== "array") {
        fail("E_SHAPE", "The root is not an array.", span ? span.line : 1, span ? span.col : 1);
      }
      return this.doc.root;
    }

    requireObjectCursor(line, col) {
      if (this.patch.cursorKind === "object") return this.patch.cursorPath;
      if (this.patch.cursorKind === "unset" && this.patch.cursorPath.length === 0) {
        this.ensureRootObject("navigation", { line, col });
        this.patch.cursorKind = "object";
        return [];
      }
      fail("E_CURSOR", "This statement requires an object cursor.", line, col);
    }

    getNode(path) {
      let node = this.doc.root;
      for (const seg of path) {
        if (!node) return null;
        if (seg.kind === "key") {
          if (node.kind !== "object") return null;
          node = node.obj.get(seg.key) || null;
        } else {
          if (node.kind !== "array") return null;
          if (seg.index < 0 || seg.index >= node.arr.length) return null;
          node = node.arr[seg.index];
        }
      }
      return node;
    }

    setAtPath(path, value, line, col) {
      if (path.length === 0) {
        this.doc.root = value;
        this.doc.rootKind = value.kind;
        return;
      }
      const parentPath = path.slice(0, -1);
      const parent = this.getNode(parentPath);
      if (!parent) fail("E_STRUCTURAL", "Missing parent path.", line, col);
      const last = path[path.length - 1];
      if (last.kind === "key") {
        if (parent.kind !== "object") fail("E_STRUCTURAL", "A key cannot be written on an array.", line, col);
        parent.obj.set(last.key, value);
      } else {
        if (parent.kind !== "array") fail("E_STRUCTURAL", "An array element cannot be written here.", line, col);
        if (last.index < 0 || last.index >= parent.arr.length) {
          fail("E_STRUCTURAL", "Invalid array element.", line, col);
        }
        parent.arr[last.index] = value;
      }
    }

    resolveParent(path, origin, span) {
      if (path.length === 0) return { parent: null, last: null };
      let node = this.doc.root;
      if (!node) {
        node = makeObject(origin || "navigation", span);
        this.doc.root = node;
        this.doc.rootKind = "object";
        this.markWrite();
      } else if (path[0].kind === "key" && node.kind !== "object") {
        fail("E_SHAPE", "The root is not an object.", span ? span.line : 1, span ? span.col : 1);
      }
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        const nextSeg = path[i + 1];
        if (seg.kind === "key") {
          if (node.kind !== "object") {
            fail("E_STRUCTURAL", "Named traversal through a non-object.", span ? span.line : 1, span ? span.col : 1);
          }
          let next = node.obj.get(seg.key);
          if (!next) {
            if (nextSeg.kind !== "key") {
              fail("E_STRUCTURAL", "Missing array before an element path.", span ? span.line : 1, span ? span.col : 1);
            }
            next = makeObject(origin || "navigation", span);
            node.obj.set(seg.key, next);
            this.markWrite();
          } else if (nextSeg.kind === "key" && next.kind !== "object") {
            fail("E_STRUCTURAL", "Named traversal through a non-object.", span ? span.line : 1, span ? span.col : 1);
          } else if (nextSeg.kind === "elem" && next.kind !== "array") {
            fail("E_STRUCTURAL", "Array element access on a non-array.", span ? span.line : 1, span ? span.col : 1);
          }
          node = next;
        } else {
          if (node.kind !== "array") {
            fail("E_STRUCTURAL", "Array element access on a non-array.", span ? span.line : 1, span ? span.col : 1);
          }
          if (seg.index < 0 || seg.index >= node.arr.length) {
            fail("E_STRUCTURAL", "Invalid array element.", span ? span.line : 1, span ? span.col : 1);
          }
          node = node.arr[seg.index];
        }
      }
      return { parent: node, last: path[path.length - 1] };
    }

    ensureObjectPath(path, origin, span) {
      if (path.length === 0) return this.ensureRootObject(origin || "heading", span);
      const { parent, last } = this.resolveParent(path, origin, span);
      if (last.kind !== "key" || parent.kind !== "object") {
        fail("E_STRUCTURAL", "Cannot allocate an object at this path.", span ? span.line : 1, span ? span.col : 1);
      }
      let node = parent.obj.get(last.key);
      if (!node) {
        node = makeObject(origin || "heading", span);
        parent.obj.set(last.key, node);
        this.markWrite();
      } else if (node.kind !== "object") {
        fail("E_SHAPE", "Expected an object at " + pathText(path) + ".", span ? span.line : 1, span ? span.col : 1);
      }
      return node;
    }

    ensureArrayPath(path, origin, span) {
      if (path.length === 0) return this.ensureRootArray(origin || "heading", span);
      const { parent, last } = this.resolveParent(path, origin, span);
      if (last.kind !== "key" || parent.kind !== "object") {
        fail("E_STRUCTURAL", "Cannot allocate an array at this path.", span ? span.line : 1, span ? span.col : 1);
      }
      let node = parent.obj.get(last.key);
      if (!node) {
        node = makeArray(origin || "heading", span);
        parent.obj.set(last.key, node);
        this.markWrite();
      } else if (node.kind !== "array") {
        fail("E_SHAPE", "Expected an array at " + pathText(path) + ".", span ? span.line : 1, span ? span.col : 1);
      }
      return node;
    }

    setRootKind() {
      if (!this.doc.root) {
        this.doc.rootKind = "absent";
      } else {
        this.doc.rootKind = this.doc.root.kind;
      }
    }

    // ---- guards -----------------------------------------------------------

    checkClosed(path, line, col) {
      for (const entry of this.patch.closed.values()) {
        if (isPathPrefix(entry.path, path)) {
          fail("E_CLOSED", "Path " + pathText(path) + " is closed until ---.", line, col, entry.span);
        }
      }
    }

    checkSealed(path, line, col) {
      for (const entry of this.patch.sealed.values()) {
        if (isPathPrefix(entry.path, path)) {
          fail("E_SEALED", "Path " + pathText(path) + " is sealed by an earlier assignment.", line, col, entry.span);
        }
      }
    }

    // ---- assignment -------------------------------------------------------

    recordAssigned(path, node, span) {
      this.doc.assigned.set(pathCanon(path), { path: path.slice(), span });
      if (node.kind === "object") {
        for (const [k, v] of node.obj) {
          this.recordAssigned(path.concat([{ kind: "key", key: k }]), v, span);
        }
      }
      // Arrays stop here: their elements have no user-addressable path.
    }

    isAllocationOnly(node) {
      return !!node && isEmptyContainer(node) && (node.origin === "heading" || node.origin === "field-array");
    }

    validateExistingAncestors(path, line, col) {
      if (path.length === 0) return;
      let cursor = this.doc.root;
      if (!cursor) return;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        if (!cursor) return;
        if (seg.kind === "key") {
          if (cursor.kind !== "object") {
            fail("E_STRUCTURAL", "Named traversal through a non-object.", line, col);
          }
          cursor = cursor.obj.get(seg.key) || null;
        } else {
          if (cursor.kind !== "array") {
            fail("E_STRUCTURAL", "Array element access on a non-array.", line, col);
          }
          cursor = cursor.arr[seg.index] || null;
        }
      }
      if (!cursor) return;
      const last = path[path.length - 1];
      if (last.kind === "key" && cursor.kind !== "object") {
        fail("E_STRUCTURAL", "Path traverses a non-object.", line, col);
      }
      if (last.kind === "elem" && cursor.kind !== "array") {
        fail("E_STRUCTURAL", "Path traverses a non-array.", line, col);
      }
    }

    assignComplete(path, value, span) {
      const line = span ? span.line : 1;
      const col = span ? span.col : 1;
      this.checkClosed(path, line, col);
      this.checkSealed(path, line, col);

      const existing = this.getNode(path);
      if (path.length > 0) {
        this.validateExistingAncestors(path, line, col);
      }

      if (existing) {
        const canon = pathCanon(path);
        if (this.doc.assigned.has(canon)) {
          const prior = this.doc.assigned.get(canon);
          fail("E_DUPLICATE", "Duplicate assignment at " + pathText(path) + ".", line, col, prior.span);
        }
        if (isNonEmptyContainer(existing)) {
          fail("E_POPULATED", "Cannot assign over a nonempty container at " + pathText(path) + ".", line, col);
        }
        if (!isContainer(existing)) {
          fail("E_SHAPE", "Cannot assign over a scalar at " + pathText(path) + ".", line, col);
        }
        if (!this.isAllocationOnly(existing)) {
          fail("E_SHAPE", "Target is not an empty allocation-only container.", line, col);
        }
        if (existing.kind !== value.kind) {
          fail("E_SHAPE", "Assignment shape does not match the existing empty container.", line, col);
        }
      }

      if (path.length === 0) {
        this.doc.root = value;
        this.doc.rootKind = value.kind;
      } else {
        this.resolveParent(path, "navigation", span);
        this.setAtPath(path, value, line, col);
      }

      this.recordAssigned(path, value, span);
      if (isContainer(value)) {
        this.patch.sealed.set(pathCanon(path), { path: path.slice(), span });
      }
      this.markWrite();
    }

    appendValue(arrayPath, value, span) {
      const line = span ? span.line : 1;
      const col = span ? span.col : 1;
      this.checkClosed(arrayPath, line, col);
      this.checkSealed(arrayPath, line, col);
      const array = this.ensureArrayPath(arrayPath, "append", span);
      const index = array.arr.length;
      const valueNode = value;
      array.arr.push(valueNode);
      const elementPath = arrayPath.concat([elem(index)]);
      if (isContainer(valueNode)) {
        this.patch.sealed.set(pathCanon(elementPath), { path: elementPath, span });
      }
      this.markWrite();
    }

    // ---- headings ---------------------------------------------------------

    handleHeadingLine(content, line, indent) {
      let hashes = 0;
      while (content[hashes] === "#") hashes++;
      if (!isHSpace(content[hashes])) {
        fail("E_HEAD_LEVEL", "A heading needs whitespace after its # sequence.", line, indent + hashes + 1);
      }
      let titleRaw = content.slice(hashes);
      titleRaw = stripLineComment(titleRaw);
      titleRaw = trimHSpace(titleRaw);
      if (titleRaw === "") {
        fail("E_HEAD_LEVEL", "A heading needs a title.", line, indent + hashes + 1);
      }

      if (hashes === 1 && titleRaw === "[]") {
        this.applyHeading({ level: 1, special: "root-array" }, line, indent + 1);
        return;
      }
      if (hashes === 1 && titleRaw === "[+]") {
        this.applyHeading({ level: 1, special: "root-append" }, line, indent + 1);
        return;
      }

      const loc = new Locator(titleRaw, line, indent + hashes + 1);
      const parsed = parseKeyPath(loc, 0);
      const suffix = parseSuffix(loc, parsed.pos, false, true);
      if (suffix.pos !== titleRaw.length) {
        loc.fail("E_KEY_PATH", "Unexpected content after heading title.", suffix.pos);
      }
      this.applyHeading({
        level: hashes,
        special: null,
        segments: parsed.segments,
        marker: suffix.marker
      }, line, indent + 1);
    }

    applyHeading(heading, line, col) {
      const level = heading.level;
      let basePath;

      if (level > 1) {
        const parent = this.patch.frames[level - 1];
        if (!parent) {
          if (!this.patch.frames[1]) {
            fail("E_HEAD_ORPHAN", "Relative heading has no parent heading frame.", line, col);
          }
          fail("E_HEAD_SKIP", "Heading level skipped a frame.", line, col);
        }
        const parentNode = this.getNode(parent);
        if (!parentNode || parentNode.kind !== "object") {
          fail("E_CURSOR", "A child heading cannot be placed beneath an array cursor.", line, col);
        }
        basePath = parent.concat(heading.segments ? keysToPath(heading.segments) : []);
      } else {
        basePath = heading.segments ? keysToPath(heading.segments) : [];
      }

      const isAppend = heading.special === "root-append" || heading.marker === "append";
      let finalPreview;
      let arrayPath = null;

      if (heading.special === "root-array") {
        finalPreview = [];
      } else if (heading.special === "root-append") {
        arrayPath = [];
        const rootNode = this.doc.root;
        const index = rootNode && rootNode.kind === "array" ? rootNode.arr.length : 0;
        finalPreview = [elem(index)];
      } else if (heading.marker === "append") {
        arrayPath = basePath;
        const arrayNode = this.getNode(arrayPath);
        const index = arrayNode && arrayNode.kind === "array" ? arrayNode.arr.length : 0;
        finalPreview = arrayPath.concat([elem(index)]);
      } else {
        finalPreview = basePath;
      }

      if (!isAppend && this.patch.finalTargets.has(pathCanon(finalPreview))) {
        const prior = this.patch.finalTargets.get(pathCanon(finalPreview));
        fail("E_HEAD_REPEAT", "Heading target " + pathText(finalPreview) + " was already selected in this patch.", line, col, prior.span);
      }

      this.checkClosed(finalPreview, line, col);
      this.checkSealed(finalPreview, line, col);

      const newActive = ancestorsInclusive(finalPreview);
      const oldActive = this.patch.activePath;
      const newlyClosed = new Map();
      for (const oldPath of oldActive) {
        const canon = pathCanon(oldPath);
        if (!newActive.some((p) => pathsEqual(p, oldPath))) {
          newlyClosed.set(canon, { path: oldPath, span: this.patch.activeSpan });
        }
      }
      newlyClosed.delete(pathCanon([]));
      for (const entry of newlyClosed.values()) {
        if (isPathPrefix(entry.path, finalPreview)) {
          fail("E_CLOSED", "Heading cannot enter a closed navigation scope.", line, col);
        }
      }

      for (const [canon, entry] of newlyClosed) {
        this.patch.closed.set(canon, entry);
      }

      // Allocation / selection.
      let finalPath;
      let cursorKind;

      if (heading.special === "root-array") {
        this.ensureRootArray("heading", { line, col });
        finalPath = [];
        cursorKind = "array";
        this.patch.frames[level] = [];
        this.patch.activePath = [[]];
        this.patch.cursorPath = [];
        this.patch.cursorKind = "array";
        this.patch.block = {
          kind: "array",
          target: [],
          origin: "root-array",
          schema: null,
          plainRowsWithoutSchema: false,
          group: freshGroup()
        };
      } else if (heading.special === "root-append") {
        const rootArray = this.ensureRootArray("heading", { line, col });
        const index = rootArray.arr.length;
        const object = makeObject("heading", { line, col });
        rootArray.arr.push(object);
        finalPath = [elem(index)];
        cursorKind = "object";
        this.patch.frames[level] = finalPath;
        this.patch.activePath = ancestorsInclusive(finalPath);
        this.patch.cursorPath = finalPath;
        this.patch.cursorKind = "object";
        this.patch.block = { kind: "none" };
      } else if (heading.marker === "append") {
        const array = this.ensureArrayPath(arrayPath, "heading", { line, col });
        const index = array.arr.length;
        const object = makeObject("heading", { line, col });
        array.arr.push(object);
        finalPath = arrayPath.concat([elem(index)]);
        cursorKind = "object";
        this.patch.frames[level] = finalPath;
        this.patch.activePath = ancestorsInclusive(finalPath);
        this.patch.cursorPath = finalPath;
        this.patch.cursorKind = "object";
        this.patch.block = { kind: "none" };
      } else {
        this.ensureObjectPath(basePath, "heading", { line, col });
        finalPath = basePath;
        cursorKind = "object";
        this.patch.frames[level] = finalPath;
        this.patch.activePath = ancestorsInclusive(finalPath);
        this.patch.cursorPath = finalPath;
        this.patch.cursorKind = "object";
        this.patch.block = { kind: "none" };
      }

      this.patch.frames.length = level + 1;
      this.patch.activeSpan = { line, col };
      this.patch.finalTargets.set(pathCanon(finalPath), { path: finalPath.slice(), span: { line, col } });
      this.doc.sawHeading = true;
      this.doc.sawAnyWrite = true;
    }

    // ---- value statements -------------------------------------------------

    handleValueStatement(content, line, indent) {
      let parsed = null;
      let lvalueError = null;
      try {
        parsed = this.parseLValue(content, line, indent + 1);
      } catch (err) {
        if (!(err instanceof ConvertError)) throw err;
        lvalueError = err;
        parsed = null;
      }

      if (parsed) {
        if (parsed.kind === "declaration") {
          this.openFieldArray(parsed.path, line, indent + 1);
          return this.index + 1;
        }

        const cursor = this.requireObjectCursor(line, indent + 1);
        const absolutePath = cursor.concat(parsed.path);
        const valueResult = this.parseFieldValue(content, parsed.valuePos, line, indent);
        this.endBlock();
        if (parsed.kind === "append") {
          this.appendValue(absolutePath, valueResult.value, { line, col: indent + 1 });
        } else {
          this.assignComplete(absolutePath, valueResult.value, { line, col: indent + 1 });
        }
        return valueResult.nextIndex;
      }

      // Not a field/declaration/append. Try a bare root value.
      if (content[0] === "{" || content[0] === "[") {
        if (!this.canBareRoot()) {
          fail("E_ROOT", "A bare root value is not allowed at this position.", line, indent + 1);
        }
        const collected = this.collectContainer(this.index, indent);
        const loc = new Locator(collected.text, line, indent + 1);
        const value = new ValueParser(loc, {}).parseAll();
        this.assignBareRoot(value, { line, col: indent + 1 });
        return collected.endLine + 1;
      }

      const loc = new Locator(content, line, indent + 1);
      let value;
      try {
        value = new ValueParser(loc, {}).parseAll();
      } catch (err) {
        if (lvalueError) throw lvalueError;
        throw err;
      }
      if (lvalueError) throw lvalueError;
      if (!this.canBareRoot()) {
        fail("E_ROOT", "A bare root value is not allowed at this position.", line, indent + 1);
      }
      this.assignBareRoot(value, { line, col: indent + 1 });
      return this.index + 1;
    }

    canBareRoot() {
      return !this.doc.sawAnyWrite && !this.doc.sawHeading && !this.doc.sawBoundary && !this.doc.root;
    }

    assignBareRoot(value, span) {
      if (!this.canBareRoot()) fail("E_ROOT", "Bare root assignment is not allowed.", span.line, span.col);
      this.doc.root = value;
      this.doc.rootKind = value.kind;
      this.doc.sawAnyWrite = true;
      this.doc.assigned.set(pathCanon([]), { path: [], span });
      this.recordAssigned([], value, span);
      if (isContainer(value)) this.patch.sealed.set(pathCanon([]), { path: [], span });
      this.patch.cursorPath = [];
      this.patch.cursorKind = value.kind === "object" || value.kind === "array" ? value.kind : "scalar";
    }

    parseLValue(content, line, colBase) {
      const loc = new Locator(content, line, colBase);
      let parsed;
      try {
        parsed = parseKeyPath(loc, 0);
      } catch (err) {
        if (err instanceof ConvertError) return null;
        throw err;
      }
      let pos = parsed.pos;
      const suffix = parseSuffix(loc, pos, true, true);
      pos = suffix.pos;

      if (suffix.marker === "array") {
        if (!onlyHSpaceOrComment(content, pos)) {
          loc.fail("E_KEY_PATH", "Unexpected content after field-array declaration.", pos);
        }
        return {
          kind: "declaration",
          path: keysToPath(parsed.segments),
          col: colBase
        };
      }

      if (suffix.marker === "append") {
        if (content[pos] !== ":") {
          loc.fail("E_KEY_PATH", "An append target requires a value after ':'.", pos);
        }
        pos++;
        return {
          kind: "append",
          path: keysToPath(parsed.segments),
          valuePos: pos,
          col: colBase
        };
      }

      if (content[pos] !== ":") return null;
      pos++;
      return {
        kind: "field",
        path: keysToPath(parsed.segments),
        valuePos: pos,
        col: colBase
      };
    }

    parseFieldValue(content, valuePos, line, indent) {
      let pos = skipHSpace(content, valuePos);
      if (pos >= content.length || (content[pos] === "/" && content[pos + 1] === "/")) {
        fail("E_VALUE", "Empty field value.", line, indent + pos + 1);
      }

      if (content[pos] === ">") {
        return this.collectContinuation(content, line, indent, pos);
      }

      if (content[pos] === "{" || content[pos] === "[") {
        const collected = this.collectContainer(this.index, indent + pos);
        const loc = new Locator(collected.text, line, indent + pos + 1);
        const value = new ValueParser(loc, {}).parseAll();
        return { value, nextIndex: collected.endLine + 1 };
      }

      const text = content.slice(pos);
      const loc = new Locator(text, line, indent + pos + 1);
      const value = new ValueParser(loc, {}).parseAll();
      return { value, nextIndex: this.index + 1 };
    }

    collectContainer(startLineIndex, startAbsoluteCol) {
      const remaining = this.lines.slice(startLineIndex).join("\n");
      const start = startAbsoluteCol;
      if (start >= remaining.length) {
        fail("E_VALUE", "Expected a container opener.", startLineIndex + 1, startAbsoluteCol + 1);
      }
      const open = remaining[start];
      if (open !== "{" && open !== "[") {
        fail("E_VALUE", "Expected '{' or '['.", startLineIndex + 1, startAbsoluteCol + 1);
      }

      const stack = [open === "{" ? "}" : "]"];
      let quote = null;
      let i = start + 1;
      let end = -1;

      while (i < remaining.length) {
        const ch = remaining[i];

        if (ch === "\n") {
          if (quote === '"' || quote === "'") {
            fail("E_VALUE", "A quoted string cannot span physical lines inside a direct container.", startLineIndex + 1, startAbsoluteCol + 1);
          }
          i++;
          continue;
        }

        if (quote === '"') {
          if (ch === "\\") {
            if (remaining[i + 1] === "\n") {
              fail("E_VALUE", "A quoted string cannot span physical lines inside a direct container.", startLineIndex + 1, startAbsoluteCol + 1);
            }
            i += 2;
            continue;
          }
          if (ch === '"') quote = null;
          i++;
          continue;
        }
        if (quote === "'") {
          if (ch === "'") quote = null;
          i++;
          continue;
        }

        if (ch === '"' || ch === "'") {
          quote = ch;
          i++;
          continue;
        }

        if (ch === "/" && remaining[i + 1] === "/") {
          i += 2;
          while (i < remaining.length && remaining[i] !== "\n") i++;
          continue;
        }

        if (ch === "{" || ch === "[") {
          stack.push(ch === "{" ? "}" : "]");
          i++;
          continue;
        }

        if (ch === "}" || ch === "]") {
          if (stack[stack.length - 1] !== ch) {
            fail("E_VALUE", "Mismatched container delimiter.", startLineIndex + 1, startAbsoluteCol + 1);
          }
          stack.pop();
          if (stack.length === 0) {
            end = i;
            break;
          }
          i++;
          continue;
        }

        i++;
      }

      if (end < 0) {
        fail("E_VALUE", "Unclosed container.", startLineIndex + 1, startAbsoluteCol + 1);
      }

      const consumed = remaining.slice(start, end + 1);
      const endLine = startLineIndex + (consumed.match(/\n/g) || []).length;
      const afterNewline = remaining.indexOf("\n", end + 1);
      const trailing = remaining.slice(end + 1, afterNewline < 0 ? remaining.length : afterNewline);
      const trailingCode = stripLineComment(trailing);
      if (trimHSpace(trailingCode) !== "") {
        fail("E_VALUE", "Only whitespace or a comment may follow a multiline container.", endLine + 1, 1);
      }

      return { text: consumed, endLine };
    }

    collectContinuation(content, line, indent, gtPos) {
      const rest = content.slice(gtPos + 1);
      if (!/^[ \t]*$/.test(rest)) {
        fail("E_SYNTAX", "Only optional whitespace may follow the > opener.", line, indent + gtPos + 2);
      }

      let body = "";
      let j = this.index + 1;
      while (j < this.lines.length) {
        const raw = this.lines[j];
        const ind = leadingHSpace(raw);
        const stripped = raw.slice(ind);
        if (stripped[0] !== ">") break;
        let payload = stripped.slice(1);
        if (payload[0] === "\t") {
          fail("E_SYNTAX", "A tab immediately after > is invalid.", j + 1, ind + 2);
        }
        if (payload[0] === " ") payload = payload.slice(1);
        body += payload + "\n";
        j++;
      }

      if (body === "") {
        fail("E_VALUE", "A > continuation block must contain at least one continuation line.", line, indent + gtPos + 1);
      }

      const loc = new Locator(body, line, 1);
      const value = new ValueParser(loc, { allowMultilineStrings: true }).parseAll({
        rejectContainerStart: true
      });
      return { value, nextIndex: j };
    }

    // ---- block / table state ---------------------------------------------

    endBlock() {
      this.patch.block = { kind: "none" };
    }

    openFieldArray(relativePath, line, col) {
      const cursor = this.requireObjectCursor(line, col);
      const path = cursor.concat(relativePath);
      this.checkClosed(path, line, col);
      this.checkSealed(path, line, col);
      this.endBlock();
      this.ensureArrayPath(path, "field-array", { line, col });
      this.patch.block = {
        kind: "array",
        target: path,
        origin: "field-array",
        schema: null,
        plainRowsWithoutSchema: false,
        group: freshGroup()
      };
    }

    arrayRow(rest, line, col) {
      const code = trimHSpace(stripLineComment(rest));
      if (this.patch.block.kind === "object-table") {
        fail("E_ROW_KIND", "Array rows are not allowed in an object table.", line, col);
      }
      if (this.patch.block.kind !== "array") {
        fail("E_BLOCK", "An array row requires an active array block.", line, col);
      }
      if (code === "~") {
        this.appendValue(this.patch.block.target, makeNull("literal"), { line, col });
        return;
      }

      const block = this.patch.block;
      if (block.schema) {
        const cells = this.parseCells(code, block.schema.columns.length, line, col);
        const resolved = this.resolveGroupRow(cells, block.group, line, col);
        const row = this.constructRowObject(block.schema.columns, resolved.values, line, col);
        this.appendValue(block.target, row, { line, col });
        block.group = resolved.group;
        return;
      }

      const value = this.parseSingleValue(code, line, col);
      this.appendValue(block.target, value, { line, col });
      block.plainRowsWithoutSchema = true;
    }

    objectRow(rest, line, col) {
      if (this.patch.block.kind === "array") {
        fail("E_ROW_KIND", "Object-map rows are not allowed in an array table.", line, col);
      }
      if (this.patch.block.kind !== "object-table") {
        fail("E_BLOCK", "Object-map rows require an active object table.", line, col);
      }
      const code = trimHSpace(stripLineComment(rest));
      const split = splitFirstTopLevelColon(code);
      if (split < 0) {
        fail("E_SYNTAX", "An object-map row needs a title colon.", line, col);
      }
      let titleText = trimHSpace(code.slice(0, split));
      let valueText = trimHSpace(code.slice(split + 1));
      if (titleText === "") {
        fail("E_KEY_PATH", "An object-map row title cannot be empty.", line, col);
      }
      const loc = new Locator(titleText, line, col);
      const title = parsePathExactly(loc, 0, "E_KEY_PATH");
      if (title.length === 1 && !title[0].quoted && (title[0].key === "_" || title[0].key === "^" || title[0].key === "~")) {
        fail("E_KEY_PATH", "A whole unquoted _, ^, or ~ is not a valid row title.", line, col);
      }

      const schema = this.patch.block.schema;
      if (schema.direct) {
        const parts = splitTopLevel(valueText, "|");
        if (parts.length !== 1) {
          fail("E_ROW_ARITY", "A direct-value object-map row needs exactly one value cell.", line, col);
        }
        const cell = this.parseCell(parts[0], line, col);
        const resolved = this.resolveGroupRow([cell], this.patch.block.group, line, col);
        const target = this.patch.block.target.concat(keysToPath(title));
        if (resolved.values[0].kind !== "omit") {
          this.assignComplete(target, resolved.values[0].value, { line, col });
        } else {
          // Omission makes no write and allocates no title-path nodes, but the
          // title path still may not enter a closed scope or traverse a scalar.
          this.checkClosed(target, line, col);
          this.validateExistingAncestors(target, line, col);
        }
        this.patch.block.group = resolved.group;
        return;
      }

      const cells = this.parseCells(valueText, schema.columns.length, line, col);
      const resolved = this.resolveGroupRow(cells, this.patch.block.group, line, col);
      const row = this.constructRowObject(schema.columns, resolved.values, line, col);
      const target = this.patch.block.target.concat(keysToPath(title));
      this.assignComplete(target, row, { line, col });
      this.patch.block.group = resolved.group;
    }

    groupReset(line, col) {
      const block = this.patch.block;
      if (block.kind === "object-table") {
        block.group = freshGroup();
        return;
      }
      if (block.kind === "array" && block.schema) {
        block.group = freshGroup();
        return;
      }
      fail("E_BLOCK", "*** requires an active table.", line, col);
    }

    // ---- schema parsing ---------------------------------------------------

    parseSchema(text, line, col) {
      const code = trimHSpace(stripLineComment(text));
      if (code === "") fail("E_SCHEMA", "Empty schema.", line, col);

      if (code[0] === "$") {
        let pos = 1;
        const afterDollar = skipHSpace(code, pos);
        if (afterDollar < code.length && code[afterDollar] !== ":") {
          fail("E_SCHEMA", "* $ must be followed by ':' or end of line.", line, col + afterDollar);
        }
        let direct = true;
        let rest = "";
        if (code[afterDollar] === ":") {
          rest = trimHSpace(code.slice(afterDollar + 1));
          direct = rest === "";
        } else {
          rest = "";
        }
        if (direct) {
          return { kind: "object", direct: true, columns: [] };
        }
        const parts = splitTopLevel(rest, "|");
        const columns = [];
        for (const part of parts) {
          const cell = trimHSpace(part);
          if (cell === "") fail("E_SCHEMA", "Empty object-map column path.", line, col);
          const loc = new Locator(cell, line, col);
          columns.push(parsePathExactly(loc, 0, "E_SCHEMA"));
        }
        return { kind: "object", direct: false, columns };
      }

      const parts = splitTopLevel(code, "|");
      const columns = [];
      for (const part of parts) {
        const cell = trimHSpace(part);
        if (cell === "") fail("E_SCHEMA", "Empty tuple-schema column path.", line, col);
        const loc = new Locator(cell, line, col);
        const parsed = parsePathExactly(loc, 0, "E_SCHEMA");
        columns.push(parsed);
      }
      if (columns.length === 0) fail("E_SCHEMA", "A tuple schema needs at least one column.", line, col);
      return { kind: "tuple", columns };
    }

    applySchema(schema, line, col) {
      const prior = this.patch.block;
      if (schema.kind === "tuple") {
        if (prior.kind !== "array") {
          fail("E_SCHEMA", "A tuple schema requires an active array block.", line, col);
        }
        if (prior.schema) {
          fail("E_SCHEMA", "Only one tuple schema is allowed per block.", line, col);
        }
        if (prior.plainRowsWithoutSchema) {
          fail("E_SCHEMA", "A tuple schema must precede ordinary array rows.", line, col);
        }
        prior.schema = schema;
        prior.group = freshGroup();
        return;
      }

      this.requireObjectCursor(line, col);
      const cursor = this.patch.cursorPath;
      this.checkClosed(cursor, line, col);
      this.checkSealed(cursor, line, col);
      this.patch.block = {
        kind: "object-table",
        target: cursor,
        schema,
        group: freshGroup()
      };
    }

    // ---- cells and rows ---------------------------------------------------

    parseCells(text, count, line, col) {
      const parts = splitTopLevel(text, "|");
      if (parts.length !== count) {
        fail("E_ROW_ARITY", "Expected " + count + " cells, found " + parts.length + ".", line, col);
      }
      const cells = [];
      for (const part of parts) {
        cells.push(this.parseCell(part, line, col));
      }
      return cells;
    }

    parseCell(text, line, col) {
      const cell = trimHSpace(text);
      if (cell === "") fail("E_CELL_EMPTY", "A data cell cannot be empty.", line, col);
      if (cell === "_") return { kind: "omit" };
      if (cell === "^") return { kind: "caret" };
      const loc = new Locator(cell, line, col);
      const value = new ValueParser(loc, {}).parseAll();
      return { kind: "value", value };
    }

    parseSingleValue(text, line, col) {
      const loc = new Locator(text, line, col);
      return new ValueParser(loc, {}).parseAll();
    }

    resolveGroupRow(cells, group, line, col) {
      if (group.ordinaryCount === 0) {
        for (const cell of cells) {
          if (cell.kind === "caret") {
            fail("E_GROUP_ROOT", "The group root row cannot contain ^.", line, col);
          }
        }
        const values = cells.map((c) => (c.kind === "omit" ? { kind: "omit" } : { kind: "value", value: cloneNode(c.value) }));
        return {
          values,
          group: {
            rootCells: cloneCells(values),
            mask: null,
            ordinaryCount: 1,
            previousCells: cloneCells(values)
          }
        };
      }

      if (group.mask === null) {
        const values = [];
        const mask = [];
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.kind === "caret") {
            mask.push(true);
            values.push(cloneCell(group.rootCells[i]));
          } else {
            mask.push(false);
            values.push(cell.kind === "omit" ? { kind: "omit" } : { kind: "value", value: cloneNode(cell.value) });
          }
        }
        return {
          values,
          group: {
            rootCells: group.rootCells,
            mask,
            ordinaryCount: 2,
            previousCells: cloneCells(values)
          }
        };
      }

      const values = [];
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (group.mask[i]) {
          if (cell.kind !== "caret") {
            fail("E_GROUP_MASK", "A locked column must contain ^.", line, col);
          }
          values.push(cloneCell(group.previousCells[i]));
        } else {
          if (cell.kind === "caret") {
            fail("E_GROUP_MASK", "A free column cannot contain ^.", line, col);
          }
          values.push(cell.kind === "omit" ? { kind: "omit" } : { kind: "value", value: cloneNode(cell.value) });
        }
      }
      return {
        values,
        group: {
          rootCells: group.rootCells,
          mask: group.mask,
          ordinaryCount: group.ordinaryCount + 1,
          previousCells: cloneCells(values)
        }
      };
    }

    constructRowObject(columns, resolved, line, col) {
      const row = makeObject("table-row", { line, col });
      const assigned = new Map();
      const sealed = new Map();

      for (let i = 0; i < columns.length; i++) {
        const cell = resolved[i];
        if (cell.kind === "omit") continue;
        this.writeRowValue(row, columns[i], cell.value, assigned, sealed, line, col);
      }
      return row;
    }

    writeRowValue(row, path, value, assigned, sealed, line, col) {
      const canon = pathCanon(path);
      for (const entry of sealed.values()) {
        if (isPathPrefix(entry.path, path)) {
          fail("E_ROW_SEAL", "A container-valued row cell cannot be extended in the same row.", line, col);
        }
      }
      if (assigned.has(canon)) {
        fail("E_DUPLICATE", "Duplicate row cell path.", line, col);
      }

      let node = row;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        if (seg.kind !== "key" || node.kind !== "object") {
          fail("E_STRUCTURAL", "Row cell path traverses a non-object.", line, col);
        }
        let next = node.obj.get(seg.key);
        if (!next) {
          next = makeObject("row-navigation", { line, col });
          node.obj.set(seg.key, next);
        } else if (next.kind !== "object") {
          fail("E_STRUCTURAL", "Row cell path traverses a non-object.", line, col);
        }
        node = next;
      }

      const last = path[path.length - 1];
      if (!last || last.kind !== "key" || node.kind !== "object") {
        fail("E_STRUCTURAL", "Invalid row cell path.", line, col);
      }
      const existing = node.obj.get(last.key);
      if (existing) {
        if (isNonEmptyContainer(existing)) {
          fail("E_POPULATED", "A row cell cannot replace a nonempty container.", line, col);
        }
        if (!isContainer(existing)) {
          fail("E_STRUCTURAL", "A row cell path traverses a scalar.", line, col);
        }
        if (existing.kind !== value.kind) {
          fail("E_SHAPE", "Row cell assignment shape mismatch.", line, col);
        }
      }

      node.obj.set(last.key, value);
      assigned.set(canon, { path: path.slice(), span: { line, col } });
      if (isContainer(value)) {
        sealed.set(canon, { path: path.slice(), span: { line, col } });
      }
    }
  }

  function cloneCell(cell) {
    return cell.kind === "omit" ? { kind: "omit" } : { kind: "value", value: cloneNode(cell.value) };
  }

  function cloneCells(cells) {
    return cells.map(cloneCell);
  }

  // ---------------------------------------------------------------------------
  // Table cell splitting
  // ---------------------------------------------------------------------------

  function splitTopLevel(text, sep) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote === '"') {
        if (ch === "\\") i++;
        else if (ch === '"') quote = null;
        continue;
      }
      if (quote === "'") {
        if (ch === "'") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "{" || ch === "[") {
        depth++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth--;
        continue;
      }
      if (depth === 0 && ch === sep) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  function splitFirstTopLevelColon(text) {
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote === '"') {
        if (ch === "\\") i++;
        else if (ch === '"') quote = null;
        continue;
      }
      if (quote === "'") {
        if (ch === "'") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ":") return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Public conversion
  // ---------------------------------------------------------------------------

  function normalizeSource(source) {
    let text = String(source == null ? "" : source);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    text = text.replace(/\r\n/g, "\n");
    const cr = text.indexOf("\r");
    if (cr >= 0) {
      const before = text.slice(0, cr);
      const line = (before.match(/\n/g) || []).length + 1;
      const col = cr - before.lastIndexOf("\n");
      fail("E_SYNTAX", "A lone carriage return is not a valid line ending.", line, col);
    }
    return text;
  }

  function parseDocument(source) {
    const text = normalizeSource(source);
    const lines = text.split("\n");
    const builder = new Builder(lines);
    builder.run();
    return builder.doc;
  }

  function serialize(node, level, pretty) {
    if (node === null || node === undefined) return "{}";
    const pad = (n) => "  ".repeat(n);
    switch (node.kind) {
      case "object": {
        if (node.obj.size === 0) return "{}";
        const entries = [];
        for (const [k, v] of node.obj) {
          entries.push(JSON.stringify(k) + ": " + serialize(v, level + 1, pretty));
        }
        if (!pretty) return "{" + entries.join(",") + "}";
        return "{\n" + entries.map((e) => pad(level + 1) + e).join(",\n") + "\n" + pad(level) + "}";
      }
      case "array": {
        if (node.arr.length === 0) return "[]";
        const entries = node.arr.map((v) => serialize(v, level + 1, pretty));
        if (!pretty) return "[" + entries.join(",") + "]";
        return "[\n" + entries.map((e) => pad(level + 1) + e).join(",\n") + "\n" + pad(level) + "]";
      }
      case "string": return JSON.stringify(node.value);
      case "number": {
        if (!Number.isFinite(node.value)) throw new Error("Non-finite number in document.");
        return JSON.stringify(node.value);
      }
      case "boolean": return node.value ? "true" : "false";
      case "null": return "null";
      default: throw new Error("Unknown node kind: " + node.kind);
    }
  }

  function stringifyDocument(node, pretty) {
    return serialize(node, 0, pretty !== false);
  }

  function convertSource(source) {
    try {
      const doc = parseDocument(source);
      const json = stringifyDocument(doc.root, true);
      let value;
      try {
        value = JSON.parse(json);
      } catch (err) {
        value = null;
      }
      return { ok: true, value, json, doc };
    } catch (err) {
      if (err instanceof ConvertError) {
        return {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            line: err.line,
            col: err.col,
            related: err.related || null
          }
        };
      }
      throw err;
    }
  }

  const api = {
    convertSource,
    parseDocument,
    stringifyDocument,
    ConvertError
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BareConverter = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
