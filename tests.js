"use strict";

const assert = require("assert");
const { convertSource } = require("./converter.js");

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, source, expected) {
  const result = convertSource(source);
  if (!result.ok) {
    failed++;
    failures.push(`${name}: expected success, got ${result.error.code}: ${result.error.message} (line ${result.error.line})`);
    return;
  }
  try {
    assert.deepStrictEqual(result.value, expected);
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: value mismatch\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(result.value)}`);
  }
}

function bad(name, source, expectedCode) {
  const result = convertSource(source);
  if (result.ok) {
    failed++;
    failures.push(`${name}: expected ${expectedCode}, got success: ${JSON.stringify(result.value)}`);
    return;
  }
  if (result.error.code !== expectedCode) {
    failed++;
    failures.push(`${name}: expected ${expectedCode}, got ${result.error.code}: ${result.error.message} (line ${result.error.line})`);
    return;
  }
  passed++;
}

// ---------------------------------------------------------------------------
// Headings and scope
// ---------------------------------------------------------------------------

ok("H01", "# a", { a: {} });
bad("H02", "# a\n# a", "E_HEAD_REPEAT");
ok("H03", "# a.b\nx: 1\n# a\ny: 2", { a: { b: { x: 1 }, y: 2 } });
bad("H04", "# a.b\n# a.b", "E_HEAD_REPEAT");
bad("H05", "# a\n## b\n# a", "E_HEAD_REPEAT");
bad("H06", "# a\n## b\n# a.b", "E_HEAD_REPEAT");
ok("H07", "# a.b\n# a.c", { a: { b: {}, c: {} } });
bad("H08", "# a.b\n# other\n# a.c", "E_CLOSED");
ok("H09", "settings.timeout: 30\n# settings", { settings: { timeout: 30 } });
ok("H10", "# config\nnetwork.timeout: 30\n## network", { config: { network: { timeout: 30 } } });
ok("H10b", "# config\nnetwork.timeout: 30\n\n## network\nenabled: true", {
  config: { network: { timeout: 30, enabled: true } }
});
bad("H11", "# a.b\nx: 1\n# a.c\ny: 2\n# a\nb.z: 3", "E_CLOSED");
ok("H12", "# a.b\n# a.b.c", { a: { b: { c: {} } } });
bad("H13", "# a.b.c\n### x", "E_HEAD_SKIP");
bad("H14", "# a\n### c", "E_HEAD_SKIP");
bad("H15", "## b", "E_HEAD_ORPHAN");
bad("H16", "# a:", "E_KEY_PATH");
ok("H17", '# "a b"', { "a b": {} });
ok("H18", "# a[+]\nx: 1", { a: [{ x: 1 }] });
ok("H19", "# a[+]\n# a[+]", { a: [{}, {}] });
bad("H20", "# a[+]\n# a", "E_SHAPE");
bad("H21", "# a[]", "E_KEY_PATH");
bad("H22", "# []\n# []", "E_HEAD_REPEAT");
ok("H23", "# []\n+ 1", [1]);
ok("H24", "# []\n# [+]", [{}]);
ok("H25", "# [+]\n# []\n+ 1", [{}, 1]);
bad("H26", "# []\n# [+]\n# []", "E_HEAD_REPEAT");
ok(
  "H27",
  '# catalog\n## items[+]\nname: "first"\n### details\nenabled: true\n## summary\ncount: 1',
  { catalog: { items: [{ name: "first", details: { enabled: true } }], summary: { count: 1 } } }
);
ok("H28", "# a\n---\n# a\nb: 1", { a: { b: 1 } });
bad("H29", "# a\n---\n## b", "E_HEAD_ORPHAN");
bad("H30", "# a[+]\n# other\n# a[+]", "E_CLOSED");
ok("H31", "items[]\n+ 1\n# items[+]", { items: [1, {}] });
bad("H32", '# catalog\n## items[+]\nname: "first"\n## summary\ncount: 1\n## items[+]', "E_CLOSED");
ok("H33", '# "a[+]"', { "a[+]": {} });
ok("H34", "# a.b\n## c\nx: 1", { a: { b: { c: { x: 1 } } } });
ok("H35", '# "a"[+]\nx: 1', { a: [{ x: 1 }] });
ok("H36", "# a.b[+]\nx: 1", { a: { b: [{ x: 1 }] } });
bad("H37", "# []\n## b", "E_CURSOR");
ok("H38", "# [+]\n## b", [{ b: {} }]);
ok("H39", "# []\n+ 1\n# [+]", [1, {}]);
bad("H40", "# [+]\n+ 1", "E_BLOCK");
bad("H41", "# []\n# [+]\n+ 1", "E_BLOCK");

// ---------------------------------------------------------------------------
// Writes, seals, assignment history, root
// ---------------------------------------------------------------------------

ok("W01", "a.x: 1\nb.y: 2\na.z: 3", { a: { x: 1, z: 3 }, b: { y: 2 } });
ok("W02", '# config\nnetwork.timeout: 30\nenabled: true\nnetwork.x: "y"', {
  config: { network: { timeout: 30, x: "y" }, enabled: true }
});
bad("W03", "a: 1\na: 2", "E_DUPLICATE");
bad("W04", "a: 1\n---\na: 2", "E_DUPLICATE");
bad("W05", "settings: { timeout: 30 }\n---\nsettings.timeout: 45", "E_DUPLICATE");
ok("W06", "settings: { timeout: 30 }\n---\nsettings.enabled: true", {
  settings: { timeout: 30, enabled: true }
});
bad("W07", "settings: { timeout: 30 }\nsettings.enabled: true", "E_SEALED");
bad("W08", "items: [1, 2]\nitems[+]: 3", "E_SEALED");
ok("W09", "items: [1, 2]\n---\nitems[+]: 3", { items: [1, 2, 3] });
bad("W10", "items: [1, 2]\n---\nitems: [3, 4]", "E_DUPLICATE");
bad("W11", "a.b.c: 1\n---\na.b: { e: 3 }", "E_POPULATED");
ok("W12", "a.b.c: 1\n---\na.b.e: 3", { a: { b: { c: 1, e: 3 } } });
ok("W13", "# a\n---\na: { x: 1 }", { a: { x: 1 } });
bad("W14", "a: {}\n---\na: { x: 1 }", "E_DUPLICATE");
bad("W15", "a: null\n---\na: 12", "E_DUPLICATE");
ok("W16", "items[]\n---\nitems: [1]", { items: [1] });
bad("W17", "items[]\n+ 1\n---\nitems: [2]", "E_POPULATED");
ok("W18", "items[]\n---\nitems: []\n---\nitems[+]: 1", { items: [1] });
bad("W19", "items[]\n---\nitems: [1]\nitems[+]: 2", "E_SEALED");
bad("W20", "a: 12\na.b: 1", "E_STRUCTURAL");
bad("W21", "a: {}\na.b: 1", "E_SEALED");
ok("W22", "a: {}\n---\na.b: 1", { a: { b: 1 } });
ok("W23", "# a\n---\na: {}\n---\na.x: 1", { a: { x: 1 } });
bad("W24", "a: { b: [ { c: 1 } ] }\n---\na.b.c: 2", "E_STRUCTURAL");
ok("W25", '{ name: "web" }\n---\nenabled: true', { name: "web", enabled: true });
ok("W26", "null", null);
bad("W27", "---\n{ a: 1 }", "E_ROOT");
bad("W28", "# a\n{ x: 1 }", "E_ROOT");
ok("W29", "true", true);
ok("W30", "true: false", { true: false });
ok("W31", "# a.b\n---\na.b: { x: 1 }", { a: { b: { x: 1 } } });
bad("W32", "# a.b\n---\na: { x: 1 }", "E_POPULATED");

// ---------------------------------------------------------------------------
// Paths and keys
// ---------------------------------------------------------------------------

ok("P01", '"a.b": 1', { "a.b": 1 });
ok("P02", 'a."b.c".d: 1', { a: { "b.c": { d: 1 } } });
ok("P03", "a . b : 1", { a: { b: 1 } });
ok("P04", '"": 1', { "": 1 });
ok("P05", 'a."": 1', { a: { "": 1 } });
ok("P06", '"a[+]": 1', { "a[+]": 1 });
ok("P07", '"a"[+]: 1', { a: [1] });
ok("P08", "a[+]: 1\na[+]: 2", { a: [1, 2] });
bad("P09", "a[+][]: 1", "E_KEY_PATH");
bad("P10", "a[].b: 1", "E_KEY_PATH");
ok("P11", '# "models[]"', { "models[]": {} });
bad("P12", '# "models[]"[]', "E_KEY_PATH");
ok("P13", '"models[]"[]\n+ 1', { "models[]": [1] });
bad("P14", "_: 1", "E_VALUE");
ok("P14b", '"_": 1', { _: 1 });
bad("P15", "items[]\n* _\n+ 1", "E_KEY_PATH");
ok("P15b", 'items[]\n* "_"\n+ 1', { items: [{ _: 1 }] });
bad("P16", "* $ : _\n- x : 1", "E_KEY_PATH");
ok("P16b", '* $ : "_"\n- x : 1', { x: { _: 1 } });
bad("P17", "* $ : v\n- _ : 1", "E_KEY_PATH");
ok("P18", '* $ : v\n- "_" : 1', { _: { v: 1 } });
bad("P19", 'a: { a: 1, "a": 2 }', "E_DUPLICATE");
ok("P20", "a: { a: 1, b: { a: 2 } }", { a: { a: 1, b: { a: 2 } } });
ok("P21", "__proto__: 1", JSON.parse('{"__proto__":1}'));
ok("P21b", '"__proto__": 1', JSON.parse('{"__proto__":1}'));
ok("P21c", "_hidden: 1", { _hidden: 1 });
bad("P22", '"a""b": 1', "E_VALUE");

// ---------------------------------------------------------------------------
// Values and strings
// ---------------------------------------------------------------------------

bad("V01", 'message: "Hello" "world"', "E_VALUE");
bad("V02", 'message: "a""b"', "E_VALUE");
bad("V03", "message: 'a''b'", "E_VALUE");
bad("V04", "message: 'a' \"b\"", "E_VALUE");
bad("V05", "message: 'It''s'", "E_VALUE");
ok("V06", 'message: "It\'s"', { message: "It's" });
ok("V07", "path: 'C:\\abc\\d'", { path: "C:\\abc\\d" });
bad("V08", 'x: "a" 1', "E_VALUE");
bad("V09", "x: true false", "E_VALUE");
ok("V10", "x: { a: 1, }", { x: { a: 1 } });
bad("V11", "x: { a: 1,, }", "E_VALUE");
ok("V12", "x: [1, 2,]", { x: [1, 2] });
ok("V13", 'x: "\\u0041"', { x: "A" });
bad("V14", 'x: "\\x"', "E_VALUE");
bad("V15", "x: 1.", "E_VALUE");
bad("V16", "x: .5", "E_VALUE");
bad("V17", "x: 01", "E_VALUE");
ok("V18", "x: 1e2", { x: 100 });
bad("V19", "x: NaN", "E_VALUE");
ok("V20", 'x: "a" // comment', { x: "a" });

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

ok(
  "T01",
  'routeAlternative[]\n* hostname | port | priority\n+ "a.com" | 12 | 1\n+ "b.com" | 13 | 3',
  { routeAlternative: [{ hostname: "a.com", port: 12, priority: 1 }, { hostname: "b.com", port: 13, priority: 3 }] }
);
bad("T02", 'items[]\n* a | b | c\n+ "b" | 80', "E_ROW_ARITY");
bad("T03", "items[]\n* a | b | c\n+ 1 | 2 | 3 | 4", "E_ROW_ARITY");
bad("T04", "items[]\n* a | b | c\n+ 1 | | 3", "E_CELL_EMPTY");
ok("T05", "items[]\n* a | b | c\n+ _ | 2 | _\n+ _ | _ | _", { items: [{ b: 2 }, {}] });
ok("T06", "items[]\n* a\n+ _", { items: [{}] });
ok("T07", "# []\n* a | b | c.x | c.y\n+ 1 | 2 | 3 | 4\n+ 5 | 6 | _ | _", [
  { a: 1, b: 2, c: { x: 3, y: 4 } },
  { a: 5, b: 6 }
]);
ok("T08", 'items[]\n* id | label\n+ 1 | "first"\n+ ~\n+ ^ | "second"\n+ ^ | "third"', {
  items: [{ id: 1, label: "first" }, null, { id: 1, label: "second" }, { id: 1, label: "third" }]
});
ok("T09", 'items[]\n+ ~\n* id | name\n+ 1 | "x"', { items: [null, { id: 1, name: "x" }] });
ok("T10", 'items[]\n* id | label\n+ 1 | "a"\n+ ^ | "b"\n***\n+ 2 | "c"\n+ ^ | "d"', {
  items: [{ id: 1, label: "a" }, { id: 1, label: "b" }, { id: 2, label: "c" }, { id: 2, label: "d" }]
});
ok("T11", 'items[]\n* id | label\n+ 1 | "a"\n+ 2 | "b"', {
  items: [{ id: 1, label: "a" }, { id: 2, label: "b" }]
});
bad("T12", 'items[]\n* id | label\n+ ^ | "a"', "E_GROUP_ROOT");
bad("T13", 'items[]\n* id | label\n+ 1 | "a"\n+ ^ | "b"\n+ 2 | "c"', "E_GROUP_MASK");
bad("T14", 'items[]\n* id | label\n+ 1 | "a"\n+ 2 | "b"\n+ ^ | "c"', "E_GROUP_MASK");
ok("T15", '* $\n- val1 : "log4j"\n- val2 : null\n- val3 : _\n- val4 : 12\n- b.c : _', {
  val1: "log4j",
  val2: null,
  val4: 12
});
ok("T16", "* $\n- first : _\n- second : ^", {});
ok("T17", "* $ :\n- first : 42\n- second : ^\n- third : ^", { first: 42, second: 42, third: 42 });
ok("T18", "# obj\n* $ : a\n- x : _", { obj: { x: {} } });
bad("T19", "* $ : v\n- a : 1\n***\n- a : 2", "E_SEALED");
bad("T19b", "* $ : v\n- a : 1\n---\n* $ : v\n- a : 2", "E_DUPLICATE");
ok("T20", "# a\n---\n* $ : v\n- a : 1", { a: { v: 1 } });
bad("T21", "items[]\n* a | a.b\n+ { x: 1 } | 2", "E_ROW_SEAL");
ok("T22", 'items[]\n* a | a.b\n+ 12 | _\n+ _ | "valid"', {
  items: [{ a: 12 }, { a: { b: "valid" } }]
});
bad("T23", 'items[]\n* a | a.b\n+ 12 | "invalid"', "E_STRUCTURAL");
bad("T24", "items[]\n* a | a\n+ 1 | 2", "E_DUPLICATE");
bad("T25", "items[]\n+ 1\n* a | b", "E_SCHEMA");
bad("T26", "items[]\n* a\n+ 1\n* b", "E_SCHEMA");
bad("T27", "* $ : v\n- a : 1\n* x | y", "E_SCHEMA");
bad("T28", "# []\n* $\n- x : 1", "E_CURSOR");
bad("T29", "* $ : v\n- a : 1\nb: 2\n- c : 3", "E_BLOCK");
ok("T30", "items[]\n* a\n+ 1\n// comment\n\n+ 2", { items: [{ a: 1 }, { a: 2 }] });
bad("T31", "***", "E_BLOCK");
bad("T32", "items[]\n+ 1\n***", "E_BLOCK");
ok("T33", "* $ : v", {});
ok("T34", '* $ : value\n- group.a : 1\n- group.b : "two"', {
  group: { a: { value: 1 }, b: { value: "two" } }
});
ok("T35", "* $ : v\n- a.x : 1\n- b.y : 2\n- a.z : 3", {
  a: { x: { v: 1 }, z: { v: 3 } },
  b: { y: { v: 2 } }
});
bad("T36", "* $ : v\n- a : 1\na.extra: 2", "E_SEALED");
ok("T37", "* $ : v\n- a : 1\n---\na.extra: 2", { a: { v: 1, extra: 2 } });
ok("T38", "* $ : v\n- a : 1\n---\n* $ : v\n- a.x : 2", {
  a: { v: 1, x: { v: 2 } }
});
ok("T39", "items[]\n* a | b\n+ _ | _\n+ ^ | ^\n+ ^ | ^", { items: [{}, {}, {}] });
ok("T40", "* $\n- a : _\n- b : _\n- c : 1", { c: 1 });
ok("T41", "* $:\n- x : 1", { x: 1 });
bad("T42", "*$:\n- x : 1", "E_SYNTAX");
bad("T43", "* $ name", "E_SCHEMA");
bad("T44", "* $ : | name\n- x : 1", "E_SCHEMA");
ok('T45', '* $ : ""\n- x : 1', { x: { "": 1 } });
bad("T46", 'items[]\n* a | b\n+ "H""i" | 2', "E_VALUE");
bad("T47", 'items[]\n* a | b\n+ "H""i"', "E_ROW_ARITY");
bad("T48", "items[]\n* tags[+] | name\n+ 1 | 2", "E_SCHEMA");
bad("T49", "* $ : tags[]", "E_SCHEMA");
ok("T50", 'items[]\n* "tags[+]" | name\n+ 1 | 2', { items: [{ "tags[+]": 1, name: 2 }] });
bad("T51", "* $ : v\n- a[+] : 1", "E_KEY_PATH");
ok("T52", "# obj\n* $ : a\n- x : 1\n* $ : b\n- y : _", { obj: { x: { a: 1 }, y: {} } });
ok("T53", "# obj\nitems[]\n+ 1\n* $ : value\n- x : 2", {
  obj: { items: [1], x: { value: 2 } }
});
ok("T54", "# obj\na: 1\n* $ : v\n- x : 2\nb: 3", {
  obj: { a: 1, x: { v: 2 }, b: 3 }
});
bad("T55", "* $ : v\n+ ~", "E_ROW_KIND");
bad("T56", "* $ : v\n+ 1", "E_ROW_KIND");
bad("T57", "items[]\n* a\n- x : 1", "E_ROW_KIND");
bad("T58", "items[]\n+ 1\ndone[+]: 2\n+ 3", "E_BLOCK");
bad("T59", "items[]\n+ 1\nenabled: true\n+ 2", "E_BLOCK");
ok("T60", "items[]\n* a | b", { items: [] });
ok("T61", 'models[]\n+ "first"\nenabled: true\nmodels[]\n+ "second"', {
  models: ["first", "second"],
  enabled: true
});
ok("T62", "# Obj\narr[+]: 12\nx: 13\narr[+]: 1", {
  Obj: { arr: [12, 1], x: 13 }
});
bad("T63", "items[]\n* a.b | a\n+ 1 | { x: 2 }", "E_POPULATED");
ok("T64", "items[]\n* a | a.b\n+ _ | 2", { items: [{ a: { b: 2 } }] });
ok("T65", "items[]\n+ ~", { items: [null] });
bad("T66", "items[]\n* a | b\n+ ~ | 2", "E_VALUE");
ok("T67", "* $", {});
ok("T68", "* $ :", {});
ok("T69", "items[]\n* id\n+ ~\n+ 1", { items: [null, { id: 1 }] });
ok("T70", "items[]\n* id\n+ 1\n+ ^\n+ ~\n+ ^", {
  items: [{ id: 1 }, { id: 1 }, null, { id: 1 }]
});
bad("T71", "# []\nitems[]", "E_CURSOR");
bad("T72", "# []\nitems[+]: 1", "E_CURSOR");

// ---------------------------------------------------------------------------
// Plain array grouping: the whole element is one implicit value column
// ---------------------------------------------------------------------------

ok("A-G01", "arr[]\n+ 1\n+ ^\n+ ^", { arr: [1, 1, 1] });
ok("A-G02", "# []\n+ 1\n+ ^\n+ ^", [1, 1, 1]);
ok("A-G03", "arr[]\n+ 1\n+ 2\n+ 3", { arr: [1, 2, 3] });
ok("A-G04", 'arr[]\n+ 1\n+ "two"\n+ { x: 3 }\n+ null', {
  arr: [1, "two", { x: 3 }, null]
});
ok("A-G05", "arr[]\n+ ~\n+ ~\n+ 7\n+ ^\n+ ~\n+ ^", {
  arr: [null, null, 7, 7, null, 7]
});
ok("A-G06", "arr[]\n+ 1\n+ ~\n+ ^\n+ ^", { arr: [1, null, 1, 1] });
ok("A-G07", "arr[]\n+ 1\n+ ^\narr[]\n+ 2\n+ ^", { arr: [1, 1, 2, 2] });
ok("A-G08", "arr[]\n+ 1\n+ ^\n---\narr[]\n+ 2\n+ ^", { arr: [1, 1, 2, 2] });
ok("A-G09", "arr[]\n+ 1\n+ ^\nother[]\n+ 2\n+ ^", {
  arr: [1, 1], other: [2, 2]
});
ok("A-G10", "[9]\n---\n# []\n+ 1\n+ ^", [9, 1, 1]);
ok("A-G11", "arr[+]: 9\narr[]\n+ 1\n+ ^", { arr: [9, 1, 1] });
ok("A-G12", "  arr []\n  + 1 // root\n\n// not a row\n\t+ ^ // mask\n  + ^", {
  arr: [1, 1, 1]
});
ok("A-G13", "arr[]\n+ ~\n* id\n+ 1\n+ ^", { arr: [null, { id: 1 }, { id: 1 }] });

for (const [name, literal, value] of [
  ["zero", "0", 0],
  ["false", "false", false],
  ["true", "true", true],
  ["null", "null", null],
  ["empty-string", '""', ""],
  ["literal-string", "'C:\\data'", "C:\\data"],
  ["quoted-caret", '"^"', "^"],
  ["quoted-omission", '"_"', "_"],
  ["quoted-tilde", '"~"', "~"],
  ["quoted-pipe", '"a|b"', "a|b"],
  ["empty-object", "{}", {}],
  ["empty-array", "[]", []],
  ["nested-object", '{ nested: { items: [1, "two"] } }', { nested: { items: [1, "two"] } }],
  ["nested-array", '[1, { nested: [false, null] }]', [1, { nested: [false, null] }]]
]) {
  ok("A-COPY-" + name, "arr[]\n+ " + literal + "\n+ ^\n+ ^", { arr: [value, value, value] });
}

bad("A-G14", "arr[]\n+ ^", "E_GROUP_ROOT");
bad("A-G15", "# []\n+ ^", "E_GROUP_ROOT");
bad("A-G16", "arr[]\n+ ~\n+ ^", "E_GROUP_ROOT");
bad("A-G17", "arr[]\n+ 1\n+ 2\n+ ^", "E_GROUP_MASK");
bad("A-G18", "arr[]\n+ 1\n+ 1\n+ ^", "E_GROUP_MASK");
bad("A-G19", "arr[]\n+ 1\n+ ^\n+ 1", "E_GROUP_MASK");
bad("A-G20", "arr[]\n+ 1\n+ ^\n+ 2", "E_GROUP_MASK");
bad("A-G21", "arr[]\n+ 1\n+ ^\n+ null", "E_GROUP_MASK");
bad("A-G22", "arr[]\n+ 1\n+ null\n+ ^", "E_GROUP_MASK");
bad("A-G23", 'arr[]\n+ 1\n+ "^"\n+ ^', "E_GROUP_MASK");
bad("A-G24", "arr[]\n+ 1\n+ 2\n+ 3\n+ ^", "E_GROUP_MASK");
bad("A-G25", "arr[]\n+ 1\n+ 2\n+ ~\n+ ^", "E_GROUP_MASK");
bad("A-G26", "arr[]\n+ 1\n+ ^\n+ ~\n+ 1", "E_GROUP_MASK");
bad("A-G27", "arr[]\n+ 1\n+ ^\narr[]\n+ ^", "E_GROUP_ROOT");
bad("A-G28", "arr[]\n+ 1\n+ ^\n---\narr[]\n+ ^", "E_GROUP_ROOT");
bad("A-G29", "arr[]\n+ 1\n+ ^\nother[]\n+ ^", "E_GROUP_ROOT");
bad("A-G30", "arr[]\n+ 1\n+ ^\nenabled: true\n+ ^", "E_BLOCK");
bad("A-G31", "arr[]\n+ 1\n+ ^\n---\n+ ^", "E_BLOCK");
bad("A-G32", "arr[]\n+ 1\n+ ^\n* id", "E_SCHEMA");
bad("A-G33", "arr[]\n+ null\n* id", "E_SCHEMA");
bad("A-G34", "arr[]\n+ 1\n+ ^\n***", "E_BLOCK");
bad("A-G35", "arr[]\n+ _", "E_VALUE");
bad("A-G36", "arr[]\n+ 1\n+ ^ | 2", "E_VALUE");
bad("A-G37", "arr[]\n+ 1\n+ ^^", "E_VALUE");
bad("A-G38", "arr[]\n+ 1\n+ ^ extra", "E_VALUE");
bad("A-G39", "arr[]\n+ 1\n+ { x: ^ }", "E_VALUE");
bad("A-G40", "arr[]\n+ [1, ^]", "E_VALUE");
bad("A-G41", "arr[+]: ^", "E_VALUE");
bad("A-G42", "x: ^", "E_VALUE");
bad("A-G43", "+ ^", "E_BLOCK");
bad("A-G44", "arr[]\n* a | b\n+ 1 | 2\n+ ^", "E_ROW_ARITY");
bad("A-G45", "* $\n- a : 1\n- b : 2\n- c : ^", "E_GROUP_MASK");
bad("A-G46", "* $\n- a : 1\n- b : ^\n- c : 1", "E_GROUP_MASK");
bad("A-G47", "arr[]\n+ 1\n+ ^\n---\n# arr[+]\n+ ^", "E_BLOCK");

try {
  const result = convertSource("arr[]\n+ { nested: { items: [1] } }\n+ ^\n+ ^");
  assert.strictEqual(result.ok, true);
  const rows = result.doc.root.obj.get("arr").arr;
  assert.notStrictEqual(rows[0], rows[1]);
  assert.notStrictEqual(rows[1], rows[2]);
  assert.notStrictEqual(rows[0].obj.get("nested"), rows[1].obj.get("nested"));
  assert.notStrictEqual(rows[1].obj.get("nested"), rows[2].obj.get("nested"));
  rows[1].obj.get("nested").obj.get("items").arr[0].value = 99;
  assert.strictEqual(rows[0].obj.get("nested").obj.get("items").arr[0].value, 1);
  assert.strictEqual(rows[2].obj.get("nested").obj.get("items").arr[0].value, 1);
  passed++;
} catch (err) {
  failed++;
  failures.push("A-COPY-independent-containers: " + err.message);
}

// ---------------------------------------------------------------------------
// Comments, >, multiline
// ---------------------------------------------------------------------------

ok("C01", 'spanning: >\n>"a\n> b"', { spanning: "a\nb" });
ok("C02", 'joined: >\n>"a"\n>"b"', { joined: "ab" });
ok("C03", 'message: >\n>"a\n> // NOT comment\n> b"', {
  message: "a\n// NOT comment\nb"
});
ok("C04", "x: > // comment\n> 12", { x: 12 });
bad("C05", 'x: > ""', "E_SYNTAX");
ok("C06", "x: >\n> 12", { x: 12 });
bad("C07", "x: >\n> { a: 1 }", "E_VALUE");
bad("C08", "x: >\n> [1, 2]", "E_VALUE");
bad("C09", 'x: >\n> "a"\n> 1', "E_VALUE");
bad("C10", "x: >\n> // comment", "E_VALUE");
bad("C11", "x: >\n\n> 1", "E_VALUE");
bad("C12", 'x: >\n>\t"a"', "E_SYNTAX");
ok("C13", 'x: >\n> \t"a"', { x: "a" });
bad("C14", "items[]\n+ {\n a: 1\n}", "E_VALUE");
ok("C15", "body: {\n a: 1,\n b: 2\n}\nnext: 3", { body: { a: 1, b: 2 }, next: 3 });
bad("C16", "body:\n{ a: 1 }", "E_VALUE");
bad("C17", "body: { a: 1 } trailing", "E_VALUE");
ok("C18", 'body: { a: "x" // c\n}', { body: { a: "x" } });
ok("C19", "--- // comment\nx: 1", { x: 1 });
ok("C20", "items[]\n* a\n+ 1\n*** // comment\n+ 2", { items: [{ a: 1 }, { a: 2 }] });
ok("C21", "* $ // comment\n- x : 1", { x: 1 });
bad("C22", "> 1", "E_VALUE");
ok("C23", 'x: { a: "---" }', { x: { a: "---" } });
ok("C24", 'x: >\n> "---"', { x: "---" });
ok("C25", "# a // comment", { a: {} });
ok("C26", "x: 1 // comment", { x: 1 });

// ---------------------------------------------------------------------------
// Root and patches
// ---------------------------------------------------------------------------

ok("R01", "", {});
ok("R02", "// only comment", {});
ok("R03", "---", {});
ok("R04", "{}", {});
ok("R05", "[]", []);
bad("R06", '"hello" "world"', "E_VALUE");
ok("R07", "null", null);
ok("R08", "12", 12);
ok("R09", "true", true);
ok("R10", '{ a: 1 }\n---\nb: 2', { a: 1, b: 2 });
ok("R11", "[1, 2]\n---\n# []\n+ 3", [1, 2, 3]);
bad("R12", "[1, 2]\n---\n[3, 4]", "E_ROOT");
bad("R13", "---\n[10, 20]", "E_ROOT");
ok("R14", "# a\n---\n# a\nb: 1", { a: { b: 1 } });
ok("R15", "# a\na: 1", { a: { a: 1 } });
bad("R16", "# a\n---\na: 1", "E_SHAPE");
ok("R17", "# a\n---\na.x: 1", { a: { x: 1 } });
ok("R18", "# []\n---\n# []\n+ 1", [1]);
bad("R19", "# []\nx: 1", "E_CURSOR");
bad("R20", "# []\n* $", "E_CURSOR");
bad("R21", "{}\n# a", "E_SEALED");
bad("R22", "null\n---\na: 1", "E_CURSOR");
bad("R23", "[]\n# []", "E_SEALED");
bad("R24", "{}\nx: 1", "E_SEALED");
ok("R25", "---\nx: 1", { x: 1 });
ok("R26", "// comment\n{ a: 1 }", { a: 1 });
bad("R27", "items[]\n+ 1\n---\n+ 2", "E_BLOCK");
bad("R28", "x: 1\n{ a: 2 }", "E_ROOT");
bad("R29", "{ a: 1 }\n{ b: 2 }", "E_ROOT");

// ---------------------------------------------------------------------------
// Extra heading / block lifetimes
// ---------------------------------------------------------------------------

ok("X-H01", "# [+]\n# [+]", [{}, {}]);
ok("X-H02", "# []\n+ 1\n# [+]\n# [+]", [1, {}, {}]);
ok("X-H03", "# a\n## b\n### c\n## d", { a: { b: { c: {} }, d: {} } });
ok("X-H04", "# a\n## b\n### c\n### d", { a: { b: { c: {}, d: {} } } });
ok("X-H05", "# a\n## b\n# a.c", { a: { b: {}, c: {} } });
ok("X-H06", "# a[+]\n## b", { a: [{ b: {} }] });
ok("X-H07", "# a[+]\n## b\n# a[+]", { a: [{ b: {} }, {}] });
ok("X-H08", "# [+]\ntext: \"This is the text\"\ncolor: \"dark_red\"", [
  { text: "This is the text", color: "dark_red" }
]);
ok("X-H09", "a.b.c: 1\n# a.b", { a: { b: { c: 1 } } });
ok("X-H10", "a.b.c: 1\n---\n# a.b\nd: 2", { a: { b: { c: 1, d: 2 } } });
ok("X-H11", "arr[+]: 1\n# arr[+]", { arr: [1, {}] });
ok("X-H12", "arr: [1]\n---\n# arr[+]", { arr: [1, {}] });
bad("X-H13", "arr: [1]\n# arr[+]", "E_SEALED");
ok("X-H14", "items[]\n+ 1\n---\n# items[+]", { items: [1, {}] });
ok("X-H15", "# config\nnetwork.timeout: 30\n## other\ny: 2", {
  config: { network: { timeout: 30 }, other: { y: 2 } }
});

// ---------------------------------------------------------------------------
// Extra writes / assignment history
// ---------------------------------------------------------------------------

ok("X-W01", "a: { b: { c: 1 } }\n---\na.b.d: 2", { a: { b: { c: 1, d: 2 } } });
bad("X-W02", "a: { b: { c: 1 } }\n---\na.b.c: 2", "E_DUPLICATE");
bad("X-W03", "a: { b: { c: 1 } }\n---\na.b: {}", "E_DUPLICATE");
bad("X-W04", "a: { b: [1] }\n---\na.b: [2]", "E_DUPLICATE");
ok("X-W05", "a: { b: [1] }\n---\na.b[+]: 2", { a: { b: [1, 2] } });
bad("X-W06", "* $ : v\n- a : 1\n---\na.v: 2", "E_DUPLICATE");
ok("X-W07", "* $ : v\n- a : _\n---\na.v: 1", { a: { v: 1 } });
bad("X-W08", "* $ : v\n- a : _\n---\na: { v: 1 }", "E_DUPLICATE");
ok("X-W09", "* $\n- a : _\n---\na: 1", { a: 1 });
ok("X-W10", "* $\n- a : _\n- a.b : 1", { a: { b: 1 } });
bad("X-W11", "# obj\n* $ : v\n- a : _\na.b: 1", "E_SEALED");
bad("X-W12", "* $ : v\n- a : 1\n* $ : v\n- a : 2", "E_SEALED");
ok("X-W13", "items[]\n* a | a\n+ 1 | _\n+ _ | 2", { items: [{ a: 1 }, { a: 2 }] });
ok("X-W14", "items[]\n* id\n+ null", { items: [{ id: null }] });
ok("X-W15", "items[]\n+ null", { items: [null] });
bad("X-W16", "items[]\n+ ", "E_VALUE");
ok("X-W17", "items[+]: {\n a: 1\n}", { items: [{ a: 1 }] });
ok("X-W18", "{\n a: 1\n}", { a: 1 });
ok("X-W19", "[\n 1,\n 2\n]", [1, 2]);
ok("X-W20", "# a\nx: {\n y: 1\n}", { a: { x: { y: 1 } } });
ok("X-W21", "a: 1\n---\nb: {\n c: 2\n}", { a: 1, b: { c: 2 } });
bad("X-W22", 'x: {\n a: "line\n b"\n}', "E_VALUE");
ok("X-W23", "items[]\n---\nitems: []", { items: [] });
bad("X-W24", "items[]\n---\nitems: {}", "E_SHAPE");
bad("X-W25", "# a\n---\n* $\n- a : 1", "E_SHAPE");
ok("X-W26", "# a\n---\n* $\n- a : { x: 1 }", { a: { x: 1 } });
ok("X-W27", "items[]\n---\n* $\n- items : [1]", { items: [1] });
ok("X-W28", "settings: { timeout: 30 }\n---\n# settings\nenabled: true", {
  settings: { timeout: 30, enabled: true }
});
bad("X-W29", "settings: { timeout: 30 }\n---\n# settings\ntimeout: 45", "E_DUPLICATE");
ok("X-W30", "# a\n* $ : v\n- x : 1", { a: { x: { v: 1 } } });
ok("X-W31", "items[]\n* a\n+ 1\nthing: 2\nitems[]\n* b\n+ 3", {
  items: [{ a: 1 }, { b: 3 }],
  thing: 2
});
ok("X-W32", "* $ : a\n* $ : b\n- x : _", { x: {} });
ok("X-W33", "# []\n* a | b", []);
ok("X-W34", "items[]\n+ ~\n* a | b\n+ 1 | 2", { items: [null, { a: 1, b: 2 }] });
bad("X-W35", "# []\n* $", "E_CURSOR");
ok("X-W36", "# a.b\n---\n* $ : v\n- a.b : 1", { a: { b: { v: 1 } } });
bad("X-W37", "# a.b\n---\n* $ : v\n- a : 1", "E_POPULATED");
ok("X-W38", "items[]\n* a | a.b\n+ _ | 1\n+ ^ | 2", {
  items: [{ a: { b: 1 } }, { a: { b: 2 } }]
});
ok("X-W39", "* $\n- a : _\n- b : ^\n- c : ^", {});
ok("X-W40", "# a\n---\n* $ : v\n- a : _", { a: {} });

// ---------------------------------------------------------------------------
// Extra table / schema edges
// ---------------------------------------------------------------------------

bad("X-T01", "items[]\n* a | b | c\n+ | 2 | 3", "E_CELL_EMPTY");
bad("X-T02", "items[]\n* a | b | c\n+ 1 | 2 |", "E_CELL_EMPTY");
ok("X-T03", 'items[]\n* ""\n+ 1', { items: [{ "": 1 }] });
ok("X-T04", '* $ : "" | a\n- x : 1 | 2', { x: { "": 1, a: 2 } });
ok("X-T05", 'items[]\n* "a|b" | c\n+ 1 | 2', { items: [{ "a|b": 1, c: 2 }] });
ok("X-T06", 'items[]\n* "a:b" | c\n+ 1 | 2', { items: [{ "a:b": 1, c: 2 }] });
ok("X-T07", '* $ : v\n- "a:b" : 1', { "a:b": { v: 1 } });
ok("X-T08", '* $ : v\n- "" : 1', { "": { v: 1 } });
ok("X-T09", "* $\n- a.b : 1", { a: { b: 1 } });
ok("X-T10", "items[]\n+ 1 // c", { items: [1] });
ok("X-T11", "items[]\n* a | b\n+ 1 | 2 // x | y", { items: [{ a: 1, b: 2 }] });
bad("X-T12", "items[]\n* a |\n+ 1", "E_SCHEMA");
bad("X-T13", "items[]\n* a || b\n+ 1 | 2 | 3", "E_SCHEMA");
bad("X-T14", "items[]\n* $ : a |\n- x : 1", "E_SCHEMA");
bad("X-T15", "items[]\n* $ : a:b\n- x : 1", "E_SCHEMA");
ok("X-T16", 'items[]\n* "a[]" | b\n+ 1 | 2', { items: [{ "a[]": 1, b: 2 }] });
ok("X-T17", '* $ : "a[]"\n- x : 1', { x: { "a[]": 1 } });
bad("X-T18", '* $ : v\n- a : ~', "E_VALUE");
bad("X-T19", "* $ : v\n- a : 1 | 2", "E_ROW_ARITY");
bad("X-T20", "* $ : a | b\n- x : | 1", "E_CELL_EMPTY");
bad("X-T21", "* $ : a | b\n- x : 1 |", "E_CELL_EMPTY");
ok("X-T22", "items[]\n* name | count | enabled\n+ \"build\" | 2 | true\n+ \"test\" | ^ | false", {
  items: [{ name: "build", count: 2, enabled: true }, { name: "test", count: 2, enabled: false }]
});
ok("X-T23", "* $ : start_url | post_type | description\n- item.add : \"/\" | \"itemAdd\" | null\n- item.delete : ^ | \"itemDelete\" | _", {
  "item": { add: { start_url: "/", post_type: "itemAdd", description: null }, delete: { start_url: "/", post_type: "itemDelete" } }
});
ok("X-T24", "# API\n* $ : start_url | post_type\n- item.add : \"/\" | \"itemAdd\"\n***\n- user.login : \"/user\" | \"userLogin\"", {
  API: { item: { add: { start_url: "/", post_type: "itemAdd" } }, user: { login: { start_url: "/user", post_type: "userLogin" } } }
});
ok("X-T25", "items[]\n+ ~", { items: [null] });
ok("X-T26", "# []\n+ ~", [null]);
ok("X-T27", "# []\n+ ~\n* a\n+ 1", [null, { a: 1 }]);
bad("X-T28", "+ ~", "E_BLOCK");
bad("X-T29", "* $ : v\n+ ~", "E_ROW_KIND");

// ---------------------------------------------------------------------------
// Extra comments / > / unicode
// ---------------------------------------------------------------------------

ok("X-C01", "x: >\n> true", { x: true });
ok("X-C02", "x: >\n> null", { x: null });
ok("X-C03", 'x: >\n> "{a:1}"', { x: "{a:1}" });
ok("X-C04", "x: >\n> // comment\n> 1", { x: 1 });
ok("X-C05", "x: >\n>\n> 1", { x: 1 });
ok("X-C06", 'x: >\n> "a" // c', { x: "a" });
ok("X-C07", 'x: >\n> "a" // c\n> "b"', { x: "ab" });
ok("X-C08", "x: >\n> 1\n\ny: 2", { x: 1, y: 2 });
ok("X-C09", "x: >\n> 1\n// c\ny: 2", { x: 1, y: 2 });
ok("X-C10", "x: >\n> 1\n---\ny: 2", { x: 1, y: 2 });
ok("X-C11", "items[+]: >\n> 1", { items: [1] });
bad("X-C12", "items[]\n+ > 1", "E_VALUE");
bad("X-C13", "items[]: >\n> 1", "E_KEY_PATH");
ok("X-C14", "x: >\t\n> 1", { x: 1 });
bad("X-C15", "x: 1\u00a0", "E_VALUE");
ok("X-C16", 'x: "a\u00a0b"', { x: "a\u00a0b" });
bad("X-C17", "x: 'a\tb'", "E_VALUE");
bad("X-C18", 'x: "a\tb"', "E_VALUE");
ok("X-C19", "\ufeffx: 1", { x: 1 });
ok("X-C20", "x: 1\r\ny: 2", { x: 1, y: 2 });
bad("X-C21", "x: 1\ry: 2", "E_SYNTAX");
ok("X-C22", 'x: "\\u0000"', { x: "\u0000" });
bad("X-C23", "x: 'a\nb'", "E_VALUE");
ok("X-C24", "x: >\n> 'a\n> b'", { x: "a\nb" });
bad("X-C25", "x: >\n> 'a''b'", "E_VALUE");
ok("X-C25b", "x: >\n> 'a'\n> 'b'", { x: "ab" });
ok("X-C26", "items[]\n+ ~ // c", { items: [null] });
ok("X-C27", '# "a//b"', { "a//b": {} });
ok("X-C28", 'x: "a//b"', { x: "a//b" });
ok("X-C29", 'x: "\\uD83D\\uDE00"', { x: "😀" });
bad("X-C30", 'x: "\\uD800"', "E_VALUE");
bad("X-C31", 'x: "\\uDC00"', "E_VALUE");
bad("X-C32", 'x: "\\uD83D" "\\uDE00"', "E_VALUE");
bad("X-C33", '"\\uD800": 1', "E_VALUE");
bad("X-C34", "### orphan", "E_HEAD_ORPHAN");
bad("X-C35", "* $\n-\tx : 1", "E_SYNTAX");
bad("X-C36", "* $ : v\n- a[ : 1", "E_KEY_PATH");
bad("X-C37", "# []\n---\n# a", "E_SHAPE");
bad("X-C38", 'x: {\n  a: "unclosed\n}\ny: "}"', "E_VALUE");

// ---------------------------------------------------------------------------
// Extra root / syntax failures
// ---------------------------------------------------------------------------

bad("X-R01", '"a""b"', "E_VALUE");
ok("X-R02", "-1", -1);
ok("X-R03", "x: -1", { x: -1 });
bad("X-R04", "hello world", "E_VALUE");
bad("X-R05", "```\nx: 1\n```", "E_VALUE");
bad("X-R06", "####### a", "E_HEAD_ORPHAN");
ok("X-R06b", "# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6\n####### h7\nx: 1", {
  h1: { h2: { h3: { h4: { h5: { h6: { h7: { x: 1 } } } } } } }
});
bad("X-R07", "#a", "E_HEAD_LEVEL");
bad("X-R08", "#", "E_HEAD_LEVEL");
bad("X-R09", "*$", "E_SYNTAX");
bad("X-R10", "+1", "E_SYNTAX");
bad("X-R11", "- x : 1", "E_BLOCK");
bad("X-R12", "+", "E_SYNTAX");
bad("X-R13", "-", "E_VALUE");
bad("X-R14", "*", "E_SYNTAX");
bad("X-R15", "~", "E_VALUE");
bad("X-R16", "^", "E_VALUE");
bad("X-R17", "_", "E_VALUE");
bad("X-R18", "x:", "E_VALUE");
bad("X-R19", "x: // c", "E_VALUE");
bad("X-R20", "objects:\n  a1: 12", "E_VALUE");
bad("X-R21", "> 1", "E_VALUE");
bad("X-R22", "a[0]: 1", "E_KEY_PATH");
bad("X-R23", "+1: 2", "E_SYNTAX");
bad("X-R24", "url: http://x", "E_VALUE");
ok("X-R25", "[]\n---\n# []\n+ ~", [null]);
bad("X-R26", "[]\n---\nx: 1", "E_CURSOR");
bad("X-R27", "[]\n---\n# []\n* $", "E_CURSOR");
bad("X-R28", "x: 1\n# []", "E_SHAPE");
ok("X-R29", "x: 1\n---\ny: 2", { x: 1, y: 2 });

// ---------------------------------------------------------------------------
// Element-scoped construction and allocation edges
// ---------------------------------------------------------------------------

ok("X-S01", "a []", { a: [] });
ok("X-S02", "a [+] : 1", { a: [1] });
ok("X-S03", "# a [+]".trim(), { a: [{}] });
ok("X-S04", "a[+] : 1", { a: [1] });
ok("X-S05", "# a[+]".trim(), { a: [{}] });
bad("X-S06", "# a []".trim(), "E_KEY_PATH");
ok("X-E01", "# a[+]\narr[+]: 1", { a: [{ arr: [1] }] });
ok("X-E02", "# a[+]\narr[]\n+ 1\n+ 2", { a: [{ arr: [1, 2] }] });
ok("X-E03", "# a[+]\n* $ : v\n- x : 1", { a: [{ x: { v: 1 } }] });
ok("X-E04", "# a[+]\nx: 1\n## b\ny: 2", { a: [{ x: 1, b: { y: 2 } }] });
ok("X-E05", "# a[+]\nx: 1\n# a[+]\ny: 2", { a: [{ x: 1 }, { y: 2 }] });
bad("X-E06", "# a[+]\nx: 1\n# other\n# a[+]", "E_CLOSED");
ok("X-E07", "# a.b[+]\n# a.b[+]", { a: { b: [{}, {}] } });
ok("X-E08", "# a[+]\n## b.c\nx: 1", { a: [{ b: { c: { x: 1 } } }] });
ok("X-E09", "# [+]\narr[]\n+ 1", [{ arr: [1] }]);
ok("X-E10", "# [+]\n* $ : v\n- x : 1", [{ x: { v: 1 } }]);

// ---------------------------------------------------------------------------
// More allocation / block-lifetime edges
// ---------------------------------------------------------------------------

ok("X-B01", "a[]\na: [1]", { a: [1] });
ok("X-B02", "a[]\na: []", { a: [] });
bad("X-B03", "a[]\na: [1]\na[+]: 2", "E_SEALED");
ok("X-B04", "a[]\na[+]: 2", { a: [2] });
ok("X-B05", "a[]\na[+]: 2\n---\na[+]: 3", { a: [2, 3] });
bad("X-B06", "a[]\na[+]: 2\na: [3]", "E_POPULATED");
bad("X-B07", "a[]\na[+]: 2\n---\na: [3]", "E_POPULATED");
ok("X-B08", "a: [1]\n---\na[]\n+ 2", { a: [1, 2] });
ok("X-B09", "a: [1]\n---\na[]", { a: [1] });
bad("X-B10", "a: [1]\na[]", "E_SEALED");
ok("X-B11", "items[]\n+ 1\nitems[+]: 2", { items: [1, 2] });
bad("X-B12", "items[]\nitems[+]: 1\n+ 2", "E_BLOCK");
ok("X-B13", "items[]\nitems[+]: 1\nitems[]\n+ 2", { items: [1, 2] });
ok("X-B14", "a[]\n+ 1\nitems[+]: 2", { a: [1], items: [2] });
ok("X-B15", "a[+]: 1\na[]", { a: [1] });
ok("X-B16", "a[+]: 1\n---\na[]\n+ 2", { a: [1, 2] });
bad("X-B17", "a: 1\na[+]: 2", "E_SHAPE");
bad("X-B18", "a: 1\na.b[+]: 2", "E_STRUCTURAL");
bad("X-B19", "a: 1\na[]", "E_SHAPE");
ok("X-B20", "a.b[]\n+ 1", { a: { b: [1] } });
bad("X-B21", "a: 1\na.b[]", "E_STRUCTURAL");
bad("X-B22", "a: [1]\n---\na: [2]", "E_DUPLICATE");
ok("X-B23", "a: [1]\n---\na[+]: 2", { a: [1, 2] });
bad("X-B24", "a: [1]\n---\na: {}", "E_DUPLICATE");
ok("X-B25", "{} \n---\nitems[]\n+ 1", { items: [1] });

// ---------------------------------------------------------------------------
// Empty allocation target shapes
// ---------------------------------------------------------------------------

bad("X-A01", "# a\n---\na: []", "E_SHAPE");
bad("X-A02", "# a\n---\na: 1", "E_SHAPE");
ok("X-A03", "# a\n---\na: {}", { a: {} });
ok("X-A04", "# a\n---\na: { x: 1 }", { a: { x: 1 } });
ok("X-A06", "items[]\n---\nitems: [1]", { items: [1] });
bad("X-A07", "items[]\n---\nitems: {}", "E_SHAPE");
bad("X-A08", "items[]\n---\nitems: 1", "E_SHAPE");
ok("X-A10", "# a\n---\n* $ : v\n- a : _", { a: {} });
ok("X-A11", "# a\n---\n* $ : v\n- a : _\n---\na.x: 1", { a: { x: 1 } });
bad("X-A12", "items[]\n---\n* $ : v\n- items : 1", "E_SHAPE");
ok("X-A13", "# a[+]\n---\nit: [1]", { a: [{}], it: [1] });
ok("X-A14", "# a[+]\n---\na[+]: 1", { a: [{}, 1] });

// ---------------------------------------------------------------------------
// Heading-only navigation scopes
// ---------------------------------------------------------------------------

ok("X-N01", "# config\nnetwork.tls.enabled: true\n## network\ntls.cert: \"server.pem\"", {
  config: {
    network: {
      tls: { enabled: true, cert: "server.pem" }
    }
  }
});
ok("X-N02", "# a\nb.c: 1\n## b\nd: 2", { a: { b: { c: 1, d: 2 } } });
ok("X-N03", "# a\nb.c.x: 1\n# a.b", { a: { b: { c: { x: 1 } } } });
ok("X-N04", "# a\nb.c.x: 1\n# a.b.c", { a: { b: { c: { x: 1 } } } });
ok("X-N05", "# a\nb.c.x: 1\n## b\n### c\ny: 2", {
  a: { b: { c: { x: 1, y: 2 } } }
});
ok("X-N06", "# a\nb.c.x: 1\n# a.d\n# a.b", { a: { b: { c: { x: 1 } }, d: {} } });
ok("X-N07", "# a.b\nx: 1\n# a.c\n# a", { a: { b: { x: 1 }, c: {} } });
ok("X-N08", "items[]\n+ 1\n# items[+]\nx: 2", { items: [1, { x: 2 }] });
ok("X-N09", "arr[+]: 1\n# arr[+]\nx: 2", { arr: [1, { x: 2 }] });
ok("X-N10a", "items[]\n+ 1\n# other\n# items[+]\nx: 2", {
  items: [1, { x: 2 }],
  other: {}
});
ok("X-N10b", "a.b: 1\n# x\n# a\nc: 2", { a: { b: 1, c: 2 }, x: {} });
ok("X-N10c", "# a\nb.c: 1\n## d\n# a.b", { a: { b: { c: 1 }, d: {} } });
ok("X-N10d", "# a\nitems[]\n+ 1\n## b\ny: 2\n# a.items[+]\nz: 3", {
  a: { items: [1, { z: 3 }], b: { y: 2 } }
});
ok("X-N10e", "# config\nnetwork.tls.enabled: true\n## other\nx: 1\n# config.network\ntls.cert: \"server.pem\"", {
  config: {
    network: { tls: { enabled: true, cert: "server.pem" } },
    other: { x: 1 }
  }
});
ok("X-N10f", "* $ : v\n- a.b : 1\n# a\nc: 2", {
  a: { b: { v: 1 }, c: 2 }
});
bad("X-N10g", "* $ : v\n- a.b : 1\n# a.b", "E_SEALED");
ok("X-N10h", "a.b: { x: 1 }\n# a\nc: 2", { a: { b: { x: 1 }, c: 2 } });
bad("X-N10i", "a: { x: 1 }\n# a", "E_SEALED");
ok("X-N10j", "a: {}\n---\n# a\nb: 1", { a: { b: 1 } });
ok("X-N10k", "# a.b\n# other\n---\n# a.c", { a: { b: {}, c: {} }, other: {} });
ok("X-N10l", "a.b[]\n+ 1\n# a.b[+]", { a: { b: [1, {}] } });
bad("X-N10m", "a: 1\n* $\n- a.b : _", "E_STRUCTURAL");
bad("X-N10n", "# a.b\n# a.c\n# a\n* $\n- b.x : _", "E_CLOSED");
ok("X-N10o", "a: {}\n* $\n- a.b : _", { a: {} });
bad("X-N10p", "a: {}\n* $\n- a.b : 1", "E_SEALED");
ok("X-N10q", "a: {}\n---\n* $\n- a.b : 1", { a: { b: 1 } });
bad("X-N10", "# a.b\nx: 1\n# a.c\ny: 2\n# a\nb.z: 3", "E_CLOSED");
bad("X-N11", "# a.b\n# other\n# a.c", "E_CLOSED");
bad("X-N12", "# a[+]\n# other\n# a[+]", "E_CLOSED");
bad("X-N13", "# catalog\n## items[+]\n## summary\n## items[+]", "E_CLOSED");
ok(
  "X-N14",
  'web-app.servlet-mapping.abc: "/abc/*"\nx : 10\n\n# web-app.servlet[+]\nservlet-name: "cofaxABC"\nservlet-class: "org.cofax.cms.CofaxABCServlet"\n\n## init-param\nrun-retry: 3\nlongStr : >\n>"First line\n> arg 12 13"',
  {
    "web-app": {
      "servlet-mapping": { abc: "/abc/*" },
      servlet: [
        {
          "servlet-name": "cofaxABC",
          "servlet-class": "org.cofax.cms.CofaxABCServlet",
          "init-param": {
            "run-retry": 3,
            longStr: "First line\narg 12 13"
          }
        }
      ]
    },
    x: 10
  }
);

// ---------------------------------------------------------------------------
// Bare-key rule: '_' allowed in bare keys except standalone '_', '-' cannot start
// ---------------------------------------------------------------------------

ok("X-K01", "a_b: 1", { a_b: 1 });
ok("X-K02", '"a_b": 1', { a_b: 1 });
ok("X-K03", "_hidden: 1", { _hidden: 1 });
ok("X-K04", '"_hidden": 1', { _hidden: 1 });
bad("X-K05", "-hidden: 1", "E_VALUE");
ok("X-K06", '"-hidden": 1', { "-hidden": 1 });
ok("X-K07", "a._hidden: 1", { a: { _hidden: 1 } });
ok("X-K08", 'a."_hidden": 1', { a: { _hidden: 1 } });
ok("X-K09", "# _hidden", { _hidden: {} });
ok("X-K10", '# "_hidden"', { _hidden: {} });
ok("X-K11", "x: { _hidden: 1 }", { x: { _hidden: 1 } });
ok("X-K12", 'x: { "_hidden": 1 }', { x: { _hidden: 1 } });
ok("X-K13", "items[]\n* _hidden\n+ 1", { items: [{ _hidden: 1 }] });
ok("X-K14", 'items[]\n* "_hidden"\n+ 1', { items: [{ _hidden: 1 }] });
ok("X-K15", "* $ : _hidden\n- x : 1", { x: { _hidden: 1 } });
ok("X-K16", '* $ : "_hidden"\n- x : 1', { x: { _hidden: 1 } });
bad("X-K17", "x: { _: 1 }", "E_VALUE");
ok("X-K18", 'x: { "_": 1 }', { x: { _: 1 } });
bad("X-K19", "# _", "E_KEY_PATH");

// ---------------------------------------------------------------------------
// Structural suffix spacing
// ---------------------------------------------------------------------------

ok("X-M01", "x []", { x: [] });
ok("X-M02", "x [+] : 1", { x: [1] });
ok("X-M03", "# x [+]\ny: 1", { x: [{ y: 1 }] });
bad("X-M04", "# x []", "E_KEY_PATH");
bad("X-M05", "x [ + ] : 1", "E_KEY_PATH");
bad("X-M06", "x [] : 1", "E_KEY_PATH");
bad("X-M07", "x [+]", "E_KEY_PATH");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failures.length) {
  console.log(failures.join("\n\n"));
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(1);
} else {
  console.log(`${passed} passed.`);
}
