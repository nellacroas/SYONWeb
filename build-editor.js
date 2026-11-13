"use strict";

const fs = require("fs");
const path = require("path");

const modules = {
  "style-mod": "node_modules/style-mod/dist/style-mod.cjs",
  "w3c-keyname": "node_modules/w3c-keyname/index.cjs",
  "crelt": "node_modules/crelt/dist/index.cjs",
  "@marijn/find-cluster-break": "node_modules/@marijn/find-cluster-break/dist/index.cjs",
  "@lezer/common": "node_modules/@lezer/common/dist/index.cjs",
  "@lezer/highlight": "node_modules/@lezer/highlight/dist/index.cjs",
  "@lezer/lr": "node_modules/@lezer/lr/dist/index.cjs",
  "@codemirror/state": "node_modules/@codemirror/state/dist/index.cjs",
  "@codemirror/view": "node_modules/@codemirror/view/dist/index.cjs",
  "@codemirror/language": "node_modules/@codemirror/language/dist/index.cjs",
  "@codemirror/commands": "node_modules/@codemirror/commands/dist/index.cjs",
  "@codemirror/search": "node_modules/@codemirror/search/dist/index.cjs",
  "@codemirror/autocomplete": "node_modules/@codemirror/autocomplete/dist/index.cjs",
  "@codemirror/lint": "node_modules/@codemirror/lint/dist/index.cjs",
  "@codemirror/streamparser": "node_modules/@codemirror/streamparser/dist/index.cjs",
  "codemirror": "node_modules/codemirror/dist/index.cjs"
};

let out = `(function (global) {\n  "use strict";\n  const __modules = {};\n  const __cache = {};\n  function __require(id) {\n    if (__cache[id]) return __cache[id].exports;\n    const fn = __modules[id];\n    if (!fn) throw new Error("Module not found: " + id);\n    const mod = { exports: {} };\n    __cache[id] = mod;\n    fn(mod, mod.exports, __require);\n    return mod.exports;\n  }\n`;

for (const [id, relPath] of Object.entries(modules)) {
  const fullPath = path.join(__dirname, relPath);
  const code = fs.readFileSync(fullPath, "utf8");
  out += `\n  __modules[${JSON.stringify(id)}] = function(module, exports, require) {\n${code}\n  };\n`;
}

const entryCode = `
  const { EditorState } = __require("@codemirror/state");
  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightSpecialChars } = __require("@codemirror/view");
  const { defaultKeymap, history, historyKeymap, indentWithTab } = __require("@codemirror/commands");
  const { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } = __require("@codemirror/language");
  const { closeBrackets, closeBracketsKeymap } = __require("@codemirror/autocomplete");
  const { searchKeymap, highlightSelectionMatches } = __require("@codemirror/search");
  const { linter, lintGutter } = __require("@codemirror/lint");
  const { tags } = __require("@lezer/highlight");

  const BARE_START = /[A-Za-z0-9_]/;

  function readQuoted(stream, quote, state, allowMultiline) {
    while (!stream.eol()) {
      const ch = stream.next();
      if (quote === '"' && ch === "\\\\") {
        if (!stream.eol()) stream.next();
        continue;
      }
      if (ch === quote) {
        state.inContinuationString = null;
        return "string";
      }
    }
    if (allowMultiline) {
      state.inContinuationString = quote;
    } else {
      state.inContinuationString = null;
    }
    return "string";
  }

  function hasTopLevelColonBeforeComment(str, fromPos) {
    let quote = null;
    let depth = 0;
    for (let i = fromPos; i < str.length; i++) {
      const ch = str[i];
      if (quote === '"') {
        if (ch === "\\\\") i++;
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
      if (ch === "/" && str[i + 1] === "/") return false;
      if (ch === "{" || ch === "[") {
        if (ch === "[" && (str.startsWith("[]", i) || str.startsWith("[+]", i))) {
          i += str[i + 1] === "+" ? 2 : 1;
          continue;
        }
        depth++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0 && ch === ":") return true;
    }
    return false;
  }

  function isFieldArrayDeclarationLine(str, fromPos) {
    let quote = null;
    for (let i = fromPos; i < str.length; i++) {
      const ch = str[i];
      if (quote === '"') {
        if (ch === "\\\\") i++;
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
      if (ch === "/" && str[i + 1] === "/") break;
      if (ch === "[" && str[i + 1] === "]") {
        const rest = str.slice(i + 2);
        return /^[ \\t]*(?:\\/\\/.*)?$/.test(rest);
      }
      if (ch === ":" || ch === "{" || ch === "}") return false;
    }
    return false;
  }

  const bareMarkupParser = {
    name: "syon",
    startState() {
      return {
        inContinuation: false,
        inContinuationString: null,
        containerDepth: 0,
        lineMode: "start"
      };
    },
    copyState(state) {
      return {
        inContinuation: state.inContinuation,
        inContinuationString: state.inContinuationString,
        containerDepth: state.containerDepth,
        lineMode: state.lineMode
      };
    },
    token(stream, state) {
      if (stream.sol()) {
        state.lineMode = "start";
      }

      if (state.lineMode === "start") {
        if (stream.eatSpace()) return null;
        if (stream.eol()) {
          state.inContinuation = false;
          state.inContinuationString = null;
          return null;
        }

        if (state.inContinuation) {
          if (stream.peek() === ">") {
            stream.next();
            if (stream.peek() === " ") stream.next();
            state.lineMode = state.inContinuationString ? "cont-string" : "cont-value";
            return "meta";
          } else {
            state.inContinuation = false;
            state.inContinuationString = null;
          }
        }

        if (stream.match("//")) {
          stream.skipToEnd();
          return "comment";
        }

        if (state.containerDepth > 0) {
          state.lineMode = "value";
        } else {
          if (stream.match(/^---(?=[ \\t]*(?:\\/\\/.*)?$)/)) {
            state.lineMode = "value";
            return "contentSeparator";
          }
          if (stream.match(/^\\*\\*\\*(?=[ \\t]*(?:\\/\\/.*)?$)/)) {
            state.lineMode = "value";
            return "contentSeparator";
          }
          if (stream.match(/^#+[ \\t]+/)) {
            state.lineMode = "heading";
            return "heading";
          }
          if (stream.match(/^#+/)) {
            state.lineMode = "heading";
            return "invalid";
          }
          if (stream.match(/^\\* /)) {
            state.lineMode = "schema";
            return "keyword";
          }
          if (stream.match(/^\\+ /)) {
            state.lineMode = "array-row";
            return "keyword";
          }
          if (stream.match(/^- /)) {
            state.lineMode = "object-row-key";
            return "keyword";
          }

          const rest = stream.string;
          const pos = stream.pos;
          if (hasTopLevelColonBeforeComment(rest, pos) || isFieldArrayDeclarationLine(rest, pos)) {
            state.lineMode = "lvalue";
          } else {
            state.lineMode = "value";
          }
        }
      }

      if (state.lineMode === "cont-string") {
        const quote = state.inContinuationString;
        const style = readQuoted(stream, quote, state, true);
        if (!state.inContinuationString) {
          state.lineMode = "cont-value";
        }
        return style;
      }

      if (stream.eatSpace()) return null;

      if (stream.match("//")) {
        stream.skipToEnd();
        return "comment";
      }

      if (state.lineMode === "heading") {
        if (stream.match(/^\\[\\+\\]|^\\[\\]/)) {
          return "modifier";
        }
        if (stream.peek() === ".") {
          stream.next();
          return "punctuation";
        }
        if (stream.peek() === '"' || stream.peek() === "'") {
          const q = stream.next();
          readQuoted(stream, q, state, false);
          return "heading";
        }
        if (stream.match(/^[A-Za-z0-9_][A-Za-z0-9_-]*/)) {
          return "heading";
        }
        stream.next();
        return "invalid";
      }

      if (state.lineMode === "schema") {
        if (stream.peek() === "$") {
          stream.next();
          return "atom";
        }
        if (stream.peek() === ":" || stream.peek() === "|") {
          stream.next();
          return "operator";
        }
        if (stream.peek() === ".") {
          stream.next();
          return "punctuation";
        }
        if (stream.peek() === '"' || stream.peek() === "'") {
          const q = stream.next();
          readQuoted(stream, q, state, false);
          return "propertyName";
        }
        if (stream.match(/^[A-Za-z0-9_][A-Za-z0-9_-]*/)) {
          return "propertyName";
        }
        stream.next();
        return "invalid";
      }

      if (state.lineMode === "object-row-key") {
        if (stream.peek() === ":") {
          stream.next();
          state.lineMode = "array-row";
          return "punctuation";
        }
        if (stream.peek() === ".") {
          stream.next();
          return "punctuation";
        }
        if (stream.peek() === '"' || stream.peek() === "'") {
          const q = stream.next();
          readQuoted(stream, q, state, false);
          return "propertyName";
        }
        if (stream.match(/^[A-Za-z0-9_][A-Za-z0-9_-]*/)) {
          return "propertyName";
        }
        stream.next();
        return "invalid";
      }

      if (state.lineMode === "lvalue") {
        if (stream.match(/^\\[\\+\\]|^\\[\\]/)) {
          return "modifier";
        }
        if (stream.peek() === ":") {
          stream.next();
          state.lineMode = "after-colon";
          return "punctuation";
        }
        if (stream.peek() === ".") {
          stream.next();
          return "punctuation";
        }
        if (stream.peek() === '"' || stream.peek() === "'") {
          const q = stream.next();
          readQuoted(stream, q, state, false);
          return "propertyName";
        }
        if (stream.match(/^[A-Za-z0-9_][A-Za-z0-9_-]*/)) {
          return "propertyName";
        }
        stream.next();
        state.lineMode = "value";
        return "invalid";
      }

      if (state.lineMode === "after-colon") {
        if (stream.match(/^>(?=[ \\t]*$)/)) {
          state.inContinuation = true;
          state.inContinuationString = null;
          state.lineMode = "value";
          return "meta";
        }
        state.lineMode = "value";
      }

      if (state.lineMode === "array-row" && state.containerDepth === 0) {
        if (stream.peek() === "|") {
          stream.next();
          return "operator";
        }
        if (stream.match(/^(?:\\^|_|~)(?=[ \\t|\\r\\n]|$|\\/\\/)/)) {
          return "atom";
        }
      }

      const inCont = state.lineMode === "cont-value";
      const ch = stream.peek();

      if (ch === '"' || ch === "'") {
        stream.next();
        return readQuoted(stream, ch, state, inCont);
      }

      if (ch === "{" || ch === "[") {
        state.containerDepth++;
        stream.next();
        return "brace";
      }

      if (ch === "}" || ch === "]") {
        state.containerDepth = Math.max(0, state.containerDepth - 1);
        stream.next();
        return "brace";
      }

      if (ch === "," || ch === ":") {
        stream.next();
        return "punctuation";
      }

      if (state.containerDepth > 0 && BARE_START.test(ch)) {
        const m = stream.match(/^[A-Za-z0-9_][A-Za-z0-9_-]*(?=[ \\t]*:)/);
        if (m) return "propertyName";
      }

      if (stream.match(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?![A-Za-z0-9_-])/)) {
        return "number";
      }

      if (stream.match(/^(?:true|false)(?![A-Za-z0-9_-])/)) {
        return "bool";
      }

      if (stream.match(/^null(?![A-Za-z0-9_-])/)) {
        return "null";
      }

      stream.next();
      return "invalid";
    }
  };

  class SimpleStream {
    constructor(string) {
      this.string = string;
      this.pos = 0;
    }
    sol() { return this.pos === 0; }
    eol() { return this.pos >= this.string.length; }
    peek() { return this.string[this.pos]; }
    next() { return this.pos < this.string.length ? this.string[this.pos++] : undefined; }
    eatSpace() {
      const start = this.pos;
      while (this.pos < this.string.length && (this.string[this.pos] === " " || this.string[this.pos] === "\\t")) {
        this.pos++;
      }
      return this.pos > start;
    }
    skipToEnd() { this.pos = this.string.length; }
    match(pattern) {
      if (typeof pattern === "string") {
        if (this.string.startsWith(pattern, this.pos)) {
          this.pos += pattern.length;
          return true;
        }
        return false;
      }
      const m = pattern.exec(this.string.slice(this.pos));
      if (m && m.index === 0) {
        this.pos += m[0].length;
        return m;
      }
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightSyonHtml(syonText) {
    if (!syonText) return "";
    const lines = String(syonText).replace(/\\r\\n/g, "\\n").split("\\n");
    const state = bareMarkupParser.startState();
    const outLines = [];

    for (const line of lines) {
      const stream = new SimpleStream(line);
      let lineHtml = "";
      while (!stream.eol()) {
        const start = stream.pos;
        const style = bareMarkupParser.token(stream, state);
        if (stream.pos === start) stream.next();
        const chunk = escapeHtml(line.slice(start, stream.pos));
        if (style) {
          lineHtml += '<span class="syon-' + style + '">' + chunk + "</span>";
        } else {
          lineHtml += chunk;
        }
      }
      if (line === "") {
        state.inContinuation = false;
        state.inContinuationString = null;
      }
      outLines.push(lineHtml);
    }
    return outLines.join("\\n");
  }

  const bareLanguage = StreamLanguage.define(bareMarkupParser);

  const bareHighlightStyle = HighlightStyle.define([
    { tag: tags.heading, color: "#4fc1ff", fontWeight: "700" },
    { tag: tags.propertyName, color: "#9cdcfe" },
    { tag: tags.modifier, color: "#dcdcaa", fontWeight: "600" },
    { tag: tags.keyword, color: "#c586c0", fontWeight: "700" },
    { tag: tags.operator, color: "#d4d4d4", fontWeight: "700" },
    { tag: tags.atom, color: "#4ec9b0", fontWeight: "700" },
    { tag: tags.meta, color: "#dcdcaa", fontWeight: "700" },
    { tag: tags.contentSeparator, color: "#c586c0", fontWeight: "700" },
    { tag: tags.string, color: "#ce9178" },
    { tag: tags.number, color: "#b5cea8" },
    { tag: tags.bool, color: "#569cd6", fontWeight: "600" },
    { tag: tags.null, color: "#569cd6", fontStyle: "italic" },
    { tag: tags.comment, color: "#6a9955", fontStyle: "italic" },
    { tag: tags.punctuation, color: "#808080" },
    { tag: tags.brace, color: "#ffd700" },
    { tag: tags.invalid, color: "#f44747", textDecoration: "underline wavy #f44747" }
  ]);

  const bareEditorTheme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4"
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
      lineHeight: "1.62"
    },
    ".cm-content": {
      padding: "12px 0",
      caretColor: "#aeafad"
    },
    ".cm-line": {
      padding: "0 14px"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-gutters": {
      backgroundColor: "#181818",
      color: "#858585",
      borderRight: "1px solid #2b2b2b",
      userSelect: "none"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#242424",
      color: "#c6c6c6"
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.04)"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#264f78 !important"
    },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(0, 100, 0, 0.3)",
      color: "#fff !important",
      outline: "1px solid #888"
    },
    ".cm-tooltip": {
      backgroundColor: "#252526",
      border: "1px solid #454545",
      color: "#cccccc",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)"
    },
    ".cm-diagnostic-error": {
      borderLeft: "3px solid #f44747",
      padding: "6px 10px"
    },
    ".cm-diagnostic-info": {
      borderLeft: "3px solid #4fc1ff",
      padding: "6px 10px"
    }
  }, { dark: true });

  function lineColToOffset(doc, lineNum, colNum) {
    const clampedLine = Math.max(1, Math.min(doc.lines, lineNum || 1));
    const lineInfo = doc.line(clampedLine);
    const offsetInLine = Math.max(0, Math.min(lineInfo.length, (colNum || 1) - 1));
    return {
      from: lineInfo.from + offsetInLine,
      to: lineInfo.to
    };
  }

  function createBareEditor(options) {
    const parent = options.parent;
    const initialDoc = options.initialDoc || "";
    const onChange = options.onChange || function () {};
    const onConvertShortcut = options.onConvertShortcut || function () {};

    const bareLinter = linter(function (view) {
      if (!global.BareConverter) return [];
      const text = view.state.doc.toString();
      const result = global.BareConverter.convertSource(text);
      if (result.ok || !result.error) return [];

      const err = result.error;
      const range = lineColToOffset(view.state.doc, err.line, err.col);
      const diagnostics = [{
        from: range.from,
        to: Math.max(range.from, range.to),
        severity: "error",
        message: "[" + err.code + "] " + err.message + (err.related && err.related.line ? " (related: line " + err.related.line + ")" : "")
      }];

      if (err.related && err.related.line && err.related.line !== err.line) {
        const relRange = lineColToOffset(view.state.doc, err.related.line, err.related.col || 1);
        diagnostics.push({
          from: relRange.from,
          to: Math.max(relRange.from, relRange.to),
          severity: "info",
          message: "Origin for " + err.code + " on line " + err.line
        });
      }

      return diagnostics;
    }, { delay: 140 });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          rectangularSelection(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          lintGutter(),
          bareLanguage,
          syntaxHighlighting(bareHighlightStyle),
          bareEditorTheme,
          bareLinter,
          keymap.of([
            {
              key: "Mod-Enter",
              run() {
                onConvertShortcut();
                return true;
              }
            },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap
          ]),
          EditorView.updateListener.of(function (update) {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          })
        ]
      })
    });

    return {
      view,
      getValue() {
        return view.state.doc.toString();
      },
      setValue(text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text }
        });
      },
      focus() {
        view.focus();
      }
    };
  }

  function highlightJsonHtml(jsonText) {
    if (!jsonText) return "";
    const escaped = escapeHtml(jsonText);
    return escaped.replace(
      /("(?:\\\\.|[^"\\\\])*")(\\s*:)?|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,
      function (match, str, colon, kw, num) {
        if (str) {
          if (colon) {
            return '<span class="json-key">' + str + "</span>" + colon;
          }
          return '<span class="json-string">' + str + "</span>";
        }
        if (kw) {
          return '<span class="json-' + (kw === "null" ? "null" : "bool") + '">' + kw + "</span>";
        }
        if (num) {
          return '<span class="json-number">' + num + "</span>";
        }
        return match;
      }
    );
  }

  global.BareEditor = {
    createBareEditor,
    highlightJsonHtml,
    highlightSyonHtml
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;

out += entryCode;

fs.writeFileSync(path.join(__dirname, "editor.bundle.js"), out, "utf8");
console.log("Built editor.bundle.js (" + Math.round(out.length / 1024) + " KB)");

// Also build spec.bundle.js with marked + SYON_v0.1.md fallback
const markedPath = path.join(__dirname, "node_modules/marked/lib/marked.umd.js");
const specMdPath = path.join(__dirname, "SYON_v0.1.md");
if (fs.existsSync(markedPath) && fs.existsSync(specMdPath)) {
  const markedCode = fs.readFileSync(markedPath, "utf8");
  const specMd = fs.readFileSync(specMdPath, "utf8");
  const specBundle = `${markedCode}\nwindow.SYON_SPEC_MD = ${JSON.stringify(specMd)};\n`;
  fs.writeFileSync(path.join(__dirname, "spec.bundle.js"), specBundle, "utf8");
  console.log("Built spec.bundle.js (" + Math.round(specBundle.length / 1024) + " KB)");
}
