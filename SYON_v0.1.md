# SYON — Synthesized Object Notation

**Version:** V0.1  
**File extension:** `.syon`

SYON is a human-editable, line-oriented notation for nested data. A SYON document denotes exactly one JSON value.

SYON is not Markdown. Its source is interpreted as SYON syntax, not rendered as Markdown. Headings move a cursor through the document, fields write values, array statements append elements, and tables define rows. Section boundaries (`---`) separate navigation contexts while preserving the accumulated document.

---

## Contents

1. Document model
2. Source format
3. Values
4. Keys and paths
5. Root
6. Headings and navigation
7. Fields, array blocks, and appends
8. Allocation, assignment, seals, and access
9. Tables
10. Sections
11. Complete examples

---

## 1. Document model

A SYON document is converted into one JSON value called the **root**.

### 1.1 Nodes

The root and every value beneath it is a **node**. A node is one of:

- object;
- array;
- string;
- number;
- boolean;
- `null`.

Objects contain string-keyed members. Object member order is not significant. Arrays contain ordered elements. Strings, numbers, booleans, and `null` are scalars.

### 1.2 Paths

A **path** identifies a node. Paths are written as dot-separated key segments:

```syon
application.database.host
```

Array elements have no path syntax. Arrays can be appended to, but elements cannot be addressed by index.

### 1.3 Statements

A nonempty source line that is not a comment-only line begins a statement. Statement forms are:

| Form | Purpose |
| --- | --- |
| `# title`, `## title`, … | Select or allocate a heading target |
| `---` | Start a new section |
| `key: value` | Assign a field at the current object cursor |
| `key[+]: value` | Append a value to an array at the current object cursor |
| `key[]` | Open an array block |
| `+ value` | Append an array row |
| `+ ~` | Append a `null` array element |
| `* schema` | Define an array-tuple or object-map schema |
| `- row` | Define an object-map row |
| `***` | Reset table-group state |
| Bare R-value | Assign the whole root (document start only) |

### 1.4 Heading path and cursor

The **cursor** is the object or array where non-heading statements operate. An **object cursor** is a cursor at an object; an **array cursor** is a cursor at an array.

A heading establishes an absolute **heading target** and makes it the cursor. The **heading path** consists of the root, every ancestor of the heading target, and the target itself. Before the first heading, the heading path is just the root.

A **heading body** is the non-heading statements after a heading until the next heading or `---`. Statements before the first heading, and statements after a `---` before the next heading, form an **implicit root body**.

A **section** is the portion of the document between `---` boundaries. The first section begins at the start of the document.

Headings and non-heading statements have separate roles:

- Headings navigate and allocate containers.
- Fields, array statements, and table rows construct data.
- Navigation and assignment protections are independent.

---

## 2. Source format

### 2.1 Encoding and byte-order mark

SYON source is UTF-8.

A single leading U+FEFF byte-order mark is ignored. A byte-order mark elsewhere is ordinary string content inside quoted strings and invalid outside quoted strings.

### 2.2 Line endings

Physical line endings may be LF or CRLF. CRLF is normalized to LF for interpretation. A lone CR is invalid.

Reconstructed `>` continuation bodies always use LF (`U+000A`) between payload lines.

### 2.3 Indentation and horizontal whitespace

Leading spaces and tabs are ignored when recognizing document statements.

Indentation never creates nesting and never makes an empty value valid.

Outside quoted strings, **horizontal whitespace** means only:

- ASCII space `U+0020`;
- ASCII tab `U+0009`.

Other Unicode spaces, including no-break space, are not grammar whitespace. They must be inside quoted strings if used as content.

U+2028 and U+2029 are ordinary content inside quoted strings. They are not line separators.

No Unicode normalization or case folding is performed. Keys and strings compare exactly as written or decoded.

### 2.4 Comments

The only comment form is a line comment beginning with `//` outside a quoted string. It extends to the physical end of the line.

```syon
# settings // application settings
enabled: true // active
```

Comments may follow:

- headings;
- fields;
- array declarations and append fields;
- `---` section boundaries;
- `***` group separators;
- table schemas and rows;
- `>` continuation openers and continuation lines;
- bare root values.

A comment inside a quoted string is literal content:

```syon
url: "https://example.com/a/b"
```

There are no block comments.

### 2.5 Statement extent

Most statements occupy one physical line:

- headings;
- field L-values and schema paths;
- table schemas and rows;
- array declarations.

The only statements that may span physical lines are:

- field, `key[+]:`, and bare-root object or array R-values beginning on their opener line;
- `>` scalar continuation blocks.

A table row, schema, or `+` row is always one physical line.

### 2.6 Statement recognition

A statement is classified using the complete key-path and value grammar. Punctuation inside a quoted string or container is not a document-level marker.

Examples:

- `"hello"` at the start of a document is a root string.
- `"hello": 1` is a field.
- `true` at the start of a document is a root boolean.
- `true: false` is a field with the key `true`.
- `1.2` is a number.
- `1.2: 3` is a field with a two-segment key path.
- `***` inside an active table is a group reset.
- `+ ~` is recognized as the null-element row before tuple arity and group counting.
- `* $` is the direct-value object-map schema, not a tuple schema with a column named `$`.

### 2.7 Unknown syntax

An unrecognized nonempty, non-comment line is an error. Markdown prose, code fences, bullet lists, and rendered Markdown tables are not silently ignored.

---

## 3. Values

### 3.1 JSON values

A value in value position is called an **R-value**. SYON values are:

| Kind | Syntax |
| --- | --- |
| Object | `{ … }` |
| Array | `[ … ]` |
| String | Double- or single-quoted |
| Number | JSON number syntax |
| Boolean | `true` or `false` |
| Null | `null` |

Each value position accepts exactly one value, subject to the string-concatenation rule in §3.4. The same value grammar applies to field R-values, `key[+]:` R-values, array rows without a schema, tuple cells, object-map cells, bare root values, and nested container values, subject to the line and context restrictions in this specification.

### 3.2 Numbers

Numbers use JSON number syntax:

```syon
0
-1
12.5
1e2
-0.5
```

Leading plus signs, leading zeroes such as `01`, a trailing decimal point such as `1.`, and a leading decimal point such as `.5` are invalid.

Non-finite values such as `NaN` and `Infinity` are not part of SYON V0.1.

### 3.3 Strings

#### Double-quoted strings

Double-quoted strings use JSON string syntax:

```syon
"hello"
"line\nbreak"
"quote: \""
"\u0041"
```

JSON escapes are supported: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and `\uXXXX`.

Raw C0 control characters `U+0000`–`U+001F` are not allowed inside double-quoted strings and must be escaped.

#### Single-quoted strings

Single-quoted strings are literal:

```syon
'C:\abc\d'
'It is ready'
```

Inside single quotes:

- backslashes are literal;
- there are no backslash escape sequences;
- the string ends at the next `'`;
- an apostrophe cannot appear inside the string; use a double-quoted string or `>` line-separated string concatenation instead;
- raw C0 control characters `U+0000`–`U+001F` are not allowed inside single-quoted strings (except reconstructed LF inside `>` bodies).

There is no doubled-quote escape. Same-line `'a''b'` and `'It''s'` are invalid syntax.

#### Physical lines

Outside `>` continuation bodies, a quoted string must begin and end on the same physical line. This remains true inside a directly written multiline object or array.

Inside a `>` reconstructed body, a quoted string may span continuation lines until its closing quote.

### 3.4 String concatenation

Quoted string literals concatenate **only** inside a `>` continuation block when separated by at least one reconstructed line break (`\n`):

```syon
message: >
> "Hello, "
> "world"

path: >
> 'C:\Users\O'
> "'"
> 'Connor'
```

Rules:

- At least one reconstructed line break (`\n`) inside a `>` continuation block must separate each closed string fragment from the next opening quote.
- Same-line string concatenation—such as `"Hello" "world"`, `"Hello""world"`, `'a''b'`, or `'It''s'`—is invalid everywhere, including on a single `>` continuation line, in ordinary fields, in bare root values, in container literals, and in table cells.
- Single- and double-quoted fragments may be mixed across `>` lines.
- Only quoted string literals concatenate. Numbers, booleans, `null`, objects, and arrays do not concatenate.
- Concatenation applies only to `>` value strings.
- Key paths, schema paths, row titles, and object-literal member names never concatenate.
- Direct multiline containers (`{ … }` and `[ … ]`) do not permit string concatenation across lines.

There is no `+` concatenation operator.

### 3.5 Objects

Object literals use braces, member names, colons, commas, and JSON-like structure:

```syon
{ a: 1, "b.c": 2 }
```

Rules:

- A member name is one key, not a dotted path. `"a.b"` is the literal key `a.b`.
- A member name may be a bare key or a quoted key.
- Bare member names follow the bare-key rules in §4.1.
- An empty quoted key such as `""` is allowed.
- Repeated member keys within the same object literal are invalid, including different spellings that decode to the same key.
- Members are separated by commas.
- Empty objects `{}` are valid.
- One trailing comma is allowed after the final member.
- `{,}`, `{a:1,,}`, and missing commas are invalid.
- Comments and line breaks between tokens are allowed.

### 3.6 Arrays

Array literals use brackets and comma-separated values:

```syon
[1, 2, 3]
["a", "b"]
[{ x: 1 }, { x: 2 }]
```

Rules:

- Empty arrays `[]` are valid.
- Values are separated by commas.
- One trailing comma is allowed.
- `[,]`, `[1,,]`, and missing commas are invalid.
- Comments and line breaks between tokens are allowed.

### 3.7 Direct multiline objects and arrays

A field, `key[+]:` append R-value, or bare root R-value may use an object or array literal spanning physical lines without `>`:

```syon
# request
method: "POST"
body: {
  "user": {
    "name": "Alice",
    "roles": ["reader", "writer"]
  }
}
```

Rules:

- The opening `{` or `[` must appear on the opener line.
- The value continues until the matching closing delimiter.
- Delimiter matching accounts for quoted strings, escapes, and comments.
- Document-level syntax is suspended while the container is parsed.
- The container contents must be valid value syntax.
- Inside a directly written container, quoted strings must still end on the same physical line.
- After the closing delimiter, only whitespace or a line comment may remain on that physical line.
- Unclosed or malformed containers are invalid.
- This multiline exception does not apply to `+` rows, table schemas, or table rows.
- A field opener followed by the container on the next line is invalid:

```syon
body:
{ x: 1 }        // invalid
```

### 3.8 `>` scalar continuation

`>` continues a scalar R-value across physical lines.

#### Where allowed

Only as an ordinary field or `key[+]:` append R-value opener:

```syon
key: >
key:>
key :>
items[+]: >
```

It is not allowed as a bare root value, on a `+` row or table row, in a table cell, or as a heading modifier.

#### Opener line

The opener is `L-value : >`.

Only optional trailing whitespace or a `//` line comment may follow `>` on that physical line. No value or hint token may follow it.

Valid:

```syon
x: >
x:>   
x: > // comment
```

Invalid:

```syon
x: > ""
x: > yaml
x: >[
```

#### Continuation lines

A continuation block consists of consecutive lines immediately following the opener.

For each continuation line:

1. Remove leading indentation before the marker.
2. The line must begin with `>`.
3. Remove that leading `>`.
4. If the next character is one ASCII space, remove exactly that one space.
5. The remaining text is the payload.
6. Append the payload followed by LF to the reconstructed body.

No other trimming is performed.

Rules:

- Both `>` and `>` followed by one ASCII space contribute an empty payload line.
- Only one optional ASCII space is removed. Additional spaces are payload.
- A tab immediately after `>` is invalid.
- A tab after the optional ASCII space is payload.
- Continuation lines never space-join.

Legal continuation starts include:

```text
>"text"
>{
> second
>
> 
```

#### Block boundary

The block ends at the first line that is not a continuation, or at end of file.

- Blank source lines and comment-only source lines without `>` end the block.
- A block must reconstruct exactly one scalar value.
- A block containing only whitespace or comments has no value and is invalid.
- A block that ends with an unclosed quote or container is invalid.

#### Interpretation

The reconstructed body is parsed using the normal value grammar and must produce exactly one scalar value.

- A reconstructed object or array is invalid. The first meaningful token may not be `{` or `[`.
- Newlines outside quoted strings are parsing whitespace.
- Newlines inside open quoted strings are string content.
- Comments are recognized outside quoted strings. A line comment may follow the `>` opener or payload text on a continuation line.
- Quoted fragments on separate `>` continuation lines (separated by at least one reconstructed newline) concatenate; multiple quoted fragments on the same continuation line are invalid.
- Unquoted text does not automatically become a string.

Examples:

```syon
spanning: >
>"a
> b"
```

produces `{"spanning": "a\nb"}`.

```syon
joined: >
>"a"
>"b"
```

produces `{"joined": "ab"}`.

```syon
message: >
>"a
> // NOT comment
> b"
```

produces `{"message": "a\n// NOT comment\nb"}`.

Valid scalar values include numbers, booleans, `null`, and strings:

```syon
x: >
> 12

y: >
> "{ str: \"12\" }"
```

Reconstructed objects and arrays are invalid:

```syon
z: >
> { str: "12" }     // invalid

w: >
> [1, 2]            // invalid
```

---

## 4. Keys and paths

### 4.1 Bare key segments

A bare key segment:

- contains only ASCII letters `A-Z`, `a-z`, ASCII digits `0-9`, underscore `_`, and hyphen `-`;
- is nonempty;
- must not start with `-`;
- must not be the single character `_` (which is reserved for table-cell omission).

Valid bare segments:

```syon
a
a-b
a_b
_hidden
__proto__
1abc
null
true
```

Segments that require quoting:

```syon
"_"
"-hidden"
```

Digits may begin a segment. JSON keywords are valid bare keys:

```syon
null: 1
true: false
false: "x"
```

As values, bare `null`, `true`, and `false` retain their JSON meanings.

### 4.2 Quoted key segments

A quoted key segment uses a double-quoted or single-quoted string.

- An empty quoted segment such as `""` is a valid empty-string key.
- Characters inside a quoted segment are literal key content after string decoding.
- In particular, `.`, `:`, `|`, `[]`, `[+]`, and `//` have no structural meaning inside quoted key content.
- String concatenation does not combine key segments.
- Heading titles, field L-values, schema paths, and row titles are single-line.

### 4.3 Dotted paths

Dots outside quoted segments separate key segments:

```syon
a.b.c
x."y.a".z
```

Horizontal whitespace around dots is ignored:

```syon
a . b . c
```

A key path used as a field or heading target is an **L-value**. A numeric-looking path segment is an object key, never an array index.

The same path grammar applies to:

- heading titles;
- field L-values;
- field-array declarations;
- `key[+]:` append targets;
- table schema cells;
- object-map row titles.

Object-literal member names are single keys, not dotted paths.

### 4.4 Structural suffixes

A field path may end with one structural suffix. A heading title may end with `[+]` only, except for the special root heading `# []`.

| Suffix | Meaning |
| --- | --- |
| `[]` | Open an array block (field declaration only) |
| `[+]` | Append to an array (field or heading) |

Rules:

- A suffix applies only to the final key segment.
- At most one suffix may appear.
- Suffixes cannot be combined or repeated.
- A suffix is recognized only outside quoted key segments.
- Whitespace before the suffix is allowed.
- A quoted marker such as `"a[+]"` is a literal key.

Valid:

```syon
items[]
items[+]: 1
x []
x [+] : 1
# items[+]
# x [+]
```

Invalid:

```syon
items[+][]: 1
items[][+]: 1
x [+]                // append requires ': value'
# items[+].name
# items[]
```

A named heading ending in `[]` is invalid. Use a field-array declaration instead. The root forms `# []` and `# [+]` are special; see §6.

---

## 5. Root

### 5.1 Root shape

The root may be any supported value: object, array, string, number, boolean, or `null`.

- Root fields, root field-array declarations, root append fields, named headings, and object-map tables at the root establish an object root.
- `# []` and `# [+]` establish an array root.
- A bare root R-value may initialize the root only at the beginning of the document, before the first heading and before the first `---`.
- Empty source produces `{}`.
- Comments, blank lines, and section boundaries alone do not establish a root shape.

Once established, the root cannot change shape or be replaced.

### 5.2 Bare root R-value

A standalone R-value is an assignment to the whole root:

```syon
{ name: "web", ports: [8080, 8081] }
```

```syon
[1, 2, 3]
```

```syon
"hello" "world"
```

```syon
null
```

Rules:

- A bare root R-value is allowed only as the first write or allocation of the document.
- It must appear before the first heading and before the first `---`.
- Blank lines and comment-only lines may precede it.
- It may be an object, array, string, number, boolean, or `null`.
- A root scalar occupies one physical line and must be a single literal (same-line string concatenation is not allowed).
- A root object or array literal may span physical lines as in §3.7.
- There is no `key: >` form for the root.
- A root container initializer seals the root until `---`.
- A root scalar is a leaf and cannot be extended or redefined.
- A document whose only write is `null` has the value `null`, not `{}`.
- A bare root value never merges into or replaces an existing root.

A bare root value after any heading or any `---` is invalid, including after a leading `---`:

```syon
---
[10, 20]          // invalid
```

```syon
# config
{ a: 1 }          // invalid
```

### 5.3 Empty documents

Empty input produces `{}`. A document containing only comments, blank lines, and section boundaries also produces `{}`.

---

## 6. Headings and navigation

### 6.1 Heading syntax

A heading has one or more `#` characters, followed by whitespace and a title:

```syon
# a
## b
### c
```

Rules:

- There is no six-`#` upper limit on heading depth.
- A heading must have whitespace after its `#` sequence.
- A heading title is a key path.
- A title may end with one `[+]` shape marker.
- A named title ending in `[]` is invalid.
- A trailing unquoted `:` is invalid.
- A title may not skip heading levels.

The special root headings are:

| Heading | Meaning |
| --- | --- |
| `# []` | Select/open the root array |
| `# [+]` | Append one object to the root array and select it |

Bare `[+]` as a statement is invalid. Unnamed relative headings such as `## [+]` are invalid.

### 6.2 Heading frames

Headings maintain a frame per level:

- `# title` is absolute from the root and clears deeper frames.
- `## title` is relative to the current `#` frame.
- `### title` and deeper are relative to the frame one level above (`L - 1`).

A heading level may not skip a frame. An orphan relative heading, including one immediately after `---`, is invalid.

A dotted heading establishes one frame for its complete target:

```syon
# a.b.c
```

establishes one level-1 frame targeting `a.b.c`. A following `## child` targets `a.b.c.child`.

For a `[+]` heading, the heading frame is the appended element. A sibling heading at the same level is relative to the previous parent frame, not to the appended element:

```syon
# catalog
## items[+]
name: "first"

### details
enabled: true

## summary
count: 1
```

produces:

```json
{
  "catalog": {
    "items": [
      {"name": "first", "details": {"enabled": true}}
    ],
    "summary": {"count": 1}
  }
}
```

Here `### details` is inside the appended item, while `## summary` is a sibling of `items` under `catalog`.

### 6.3 Heading allocation and selection

A named heading without `[+]` selects its target object:

- Missing intermediate objects and a missing final object are allocated as empty objects.
- An existing target object is selected and its contents are preserved.
- An existing array or scalar at the target is a shape error.

A heading ending in `[+]` appends an editable object:

```syon
# application.jobs[+]
name: "build"
```

This creates or uses the `application` object, creates or uses the `jobs` array if needed, appends one empty object, and selects that object.

Rules:

- The appended object is editable and unsealed.
- Appending does not seal the containing array.
- Each `[+]` heading selects a fresh element.
- The containing array must be accessible and unsealed.
- A named array heading such as `# jobs[]` is invalid; use `jobs[]` on an object cursor.

A heading ends any active array block or table. After `# [+]` the cursor is an object, so a plain `+` row is invalid.

A child heading beneath an array cursor is invalid. Use `# [+]` to append and select an object when fields or child headings are needed:

```syon
# [+]
text: "first"

# [+]
text: "second"
```

produces:

```json
[{"text":"first"},{"text":"second"}]
```

Heading selection is not an assignment. A heading may select an existing object that was assigned earlier in the document if the path is accessible and unsealed; selecting it does not create a new assignment or reset assignment history.

Heading selection still obeys seals: a heading may not select a sealed target or enter a sealed path. Subsequent writes beneath an accessible ancestor of a sealed descendant remain subject to that seal.

### 6.4 Navigation scopes

**Only headings open navigation scopes.** A navigation scope is a path opened by a heading. A heading-opened path is a target path or ancestor path opened by a heading. A closed navigation scope is a heading-opened path that is no longer on the current heading path; its descendants are also inaccessible through the closed prefix.

A heading opens:

- its absolute target path;
- every ancestor of that target.

These paths form the current heading path.

Non-heading statements—fields, `key[]` declarations, `key[+]:` appends, `+` rows, table schemas, and table rows—may allocate and traverse data, but they do **not** open or close navigation scopes.

Within a heading body, non-heading statements may access paths in any order. Moving from one sibling path to another does not close either path. All operations still obey closed scopes, seals, assignment history, and shape compatibility.

An object or array created implicitly by a field, declaration, append, or table row is not a previously opened heading scope.

### 6.5 Heading changes and closed scopes

When a new heading is entered:

1. Resolve its absolute target path.
2. Reject the heading if its path enters or passes through an already-closed navigation scope.
3. Retain heading-opened paths shared with the new target.
4. Close heading-opened paths left outside the new target.
5. Open or allocate the new heading path.

The root never closes.

A closed path and everything beneath it are inaccessible until `---`.

Implicitly allocated nodes do not close merely because another heading is entered. However, an implicit node beneath a closed heading-opened path becomes inaccessible through that closed prefix.

### 6.6 Valid and invalid navigation examples

Valid: an implicitly allocated object can be selected by a later heading.

```syon
# config
network.timeout: 30

## network
enabled: true
```

produces:

```json
{"config":{"network":{"timeout":30,"enabled":true}}}
```

Valid: implicit descendants remain accessible while their heading-opened ancestor stays open.

```syon
# config
network.tls.enabled: true

## network
tls.cert: "server.pem"
```

produces:

```json
{"config":{"network":{"tls":{"enabled":true,"cert":"server.pem"}}}}
```

Valid: an array block is syntactic, not a navigation scope.

```syon
items[]
+ 1

# items[+]
x: 2
```

produces:

```json
{"items":[1,{"x":2}]}
```

Invalid: `# a.c` closes the heading-opened `a.b` branch.

```syon
# a.b
x: 1

# a.c
y: 2

# a
b.z: 3              // invalid: a.b is closed
```

Invalid: `# other` closes `a`, so a later `# a.c` cannot enter it.

```syon
# a.b
# other
# a.c                // invalid
```

Invalid: the containing array of a `[+]` heading was heading-opened and then closed.

```syon
# a[+]
# other
# a[+]               // invalid
```

Valid: an implicit object under a path that remains open can be entered later.

```syon
# a
b.c: 1

# a.d
# a.b
```

produces:

```json
{"a":{"b":{"c":1},"d":{}}}
```

### 6.7 Final heading target once per section

Within one section, an exact final heading target may be selected only once.

- Compare decoded absolute paths, not source spelling or heading level. `# a` and `# "a"` are the same path. `# "a.b"` is one key; `# a.b` is two segments.
- Intermediate heading components do not consume this allowance.
- Fields, declarations, appends, and table rows do not consume this allowance.
- Each `[+]` heading selects a fresh element and therefore has a different final target.
- `# []` is a final heading target and counts once per section.
- `# [+]` always selects a fresh element.

Example:

```syon
# a.b
# a.c
```

is valid; `a` is shared, `b` and `c` are distinct final targets.

```syon
# a.b
# a.b
```

is invalid; `a.b` is a repeated final heading target.

A path that was a final heading target may later be used as an intermediate:

```syon
# a.b
# a.b.c
```

is valid, as is:

```syon
# a.b
# a
```

Only repeating the same exact path as a final target is forbidden.

Root-array heading sequences follow the same rule:

```syon
# []
# [+]
```

is valid.

```syon
# [+]
# []
```

is valid when `# []` has not already been used in that section.

```syon
# []
# []
```

is invalid.

```syon
# []
# [+]
# []
```

is invalid because `# []` repeats its final target.

---

## 7. Fields, array blocks, and appends

### 7.1 Fields

A field writes a value at the current object cursor:

```syon
key: value
```

Whitespace around `:` is optional:

```syon
x: 1
y : 2
z:3
```

Rules:

- A field requires an object cursor.
- A field cannot be written directly on an array cursor.
- A dotted field path writes beneath the current object.
- Missing intermediate objects are allocated as needed.
- An empty field R-value is invalid. An indented body does not make it valid.
- Fields do not change the cursor.
- Fields do not open or close navigation scopes.
- Fields must respect closed navigation scopes, seals, assignment history, and shape compatibility.

```syon
# application
network.timeout: 30
```

produces:

```json
{"application":{"network":{"timeout":30}}}
```

### 7.2 Appending with `key[+]:`

`key[+]: value` appends one value to an array relative to the current object cursor:

```syon
# Obj
arr[+]: 12
arr[+]: 1
x: 13
```

produces:

```json
{"Obj":{"arr":[12,1],"x":13}}
```

Rules:

- The cursor must be an object.
- The append target is resolved using the normal key-path rules.
- Missing intermediate objects and a missing target array are allocated.
- The target must be an array or absent.
- The appended value may be a scalar, object, or array.
- Appending a container value seals that element, not the array.
- The object cursor does not move.
- An append statement ends an active array block.
- A later plain `+` requires another array block.
- Appending does not bypass closed paths or seals.
- A literal-assigned array is sealed for its assignment section; appending becomes valid after `---`.
- Appending to an array that was assigned in an earlier section is allowed.
- Another whole-array assignment remains a duplicate assignment.

The R-value may use a direct multiline object or array, or `>` continuation:

```syon
items[+]: {
  id: 1,
  name: "first"
}
a.b[+]: [1, 2]
```

### 7.3 Field-array declarations

`key[]` opens a temporary array block without changing the heading cursor:

```syon
# agent
models[]
+ "grok"
+ "another"

enabled: true
```

produces:

```json
{"agent":{"models":["grok","another"],"enabled":true}}
```

Rules:

- The cursor must be an object.
- `key[]` allocates an array if absent and preserves existing elements.
- The array path must be accessible and unsealed.
- A field-array declaration is an allocation, not an assignment and not a seal.
- It does not reset heading frames, final-target history, navigation state, seals, or assignment history.
- Whitespace before `[]` is allowed.
- A field-array declaration ends the previous array or object table block and opens a new array block.
- Repeated field-array declarations are allowed while the path remains accessible and unsealed.
- Missing intermediate objects are allocated.
- A non-array target is a shape error.

An empty array created by `key[]` may receive its first complete assignment while it is still empty and the value has matching shape, for example after a section boundary:

```syon
items[]
---
items: [1]
```

This produces `{"items":[1]}`. Once such an array has been assigned, it cannot be wholly assigned again. Explicit appends remain possible after a seal reset.

### 7.4 Array blocks

An array block contains an optional tuple schema followed by array rows:

```syon
models[]
* id | name
+ 1 | "first"
+ 2 | "second"
```

Rules:

- A schema is not required for plain non-tuple `+` rows.
- `_` and `***` require a tuple schema.
- A complete `+ ^` row is also allowed without a schema, subject to the fixed row-2 group mask (§7.5, §9.9).
- `+ ~` is allowed with or without a schema.
- Blank lines and comment-only lines do not end a block.
- The next ordinary non-row statement ends the block; that statement is interpreted at the unchanged cursor.
- A new field-array declaration ends the previous block and opens another.
- An object-map schema ends a field-array block and opens an object table at the unchanged object cursor.
- Headings, `---`, and end of file also end the block.
- Ending a block does not open or close a navigation scope.
- An array block is not a navigation scope.
- Each new array block starts with fresh group state, regardless of elements already present in its target array.

### 7.5 Plain array rows

A free-standing object or array literal is not an array row and does not append to an open array block. Use `+` rows.

Without a tuple schema, an ordinary `+` row appends one value. The whole element acts as one implicit value column for grouping:

```syon
items[]
+ 12
+ {"x": 1}
+ [1, 2]
+ null
```

Whole-row repetition is also supported:

```syon
arr[]
+ 1
+ ^
+ ^
```

produces `{"arr":[1,1,1]}`.

Rules:

- Every `+` row is one physical line.
- `>` continuation is not allowed on `+` rows.
- A container value is sealed as one element.
- The containing array is not sealed.
- The first ordinary row must contain an explicit value; `+ ^` there is an error (`E_GROUP_ROOT`).
- The second ordinary row fixes the single-column group mask. If it is `+ ^`, the whole element is locked to the first row's value and every later ordinary row must also be `+ ^`.
- If the second ordinary row contains an explicit value, no later row in that block may introduce `+ ^`, even if the first two values are equal. Violating either mask rule is an error (`E_GROUP_MASK`).
- Copied objects and arrays are independent values, not mutable aliases.
- `_` and `***` are not supported without a schema. To start a fresh plain-array group, open a new array block; reopening the array preserves existing elements but discards the previous group's state.
- `+ ~` appends a `null` element.
- `+ null` appends the value `null` and counts as an ordinary row; `+ ~` does not count for grouping.
- Quoted `"^"` and `'^'` are ordinary string values; they do not declare a copy mask.
- Only the complete unquoted `+ ^` row has this copying meaning. `^` is not a general value for fields, `key[+]:` appends, root initializers, or nested literals.
- A bare `+` or a `+` with no value is invalid.

### 7.6 `+ ~`

The complete row `+ ~` appends one `null` array element inside an active array block or root-array context.

- It is valid with or without a tuple schema.
- It may appear before a tuple schema; a tuple schema may follow it.
- It is not a tuple row.
- It bypasses tuple arity.
- It never counts as a group root, mask declaration, or later group member.
- It does not reset group state.
- It is invalid in an object-map table.
- A quoted `"~"` is an ordinary string.

### 7.7 The root-array cursor

`# []` opens the root array as an array cursor. It does not itself append an element.

Rules:

- Fields and field-array declarations cannot be written directly on the root-array cursor.
- A child heading beneath the root-array cursor is invalid.
- Unnamed relative headings such as `## [+]` are invalid.
- A tuple schema may be used in the root-array context.
- `+` rows append to the root array.
- `+ ~` appends a `null` element.
- `# [+]` appends and selects a new object.
- An object-map schema is invalid on the root-array cursor.

Example:

```syon
# []
* id | name
+ 1 | "first"
+ 2 | "second"
```

produces:

```json
[{"id":1,"name":"first"},{"id":2,"name":"second"}]
```

### 7.8 Array allocation and preservation

- A field-array declaration allocates an empty array if absent.
- `# []` allocates an empty root array if absent.
- `models: []` is an ordinary field assignment to an array literal. It does not open an array block and seals `models` until `---`.
- Array openers preserve existing elements; they never clear an array.
- Repeating an array opener is allowed only while the path is accessible and unsealed.
- An array closed by a heading change cannot be reopened until `---`.
- An array sealed by a complete array assignment cannot be appended to until `---`.

### 7.9 Array element model

Arrays may contain different JSON value kinds.

- Each append adds a fresh element.
- A literal-valued element is sealed for its assignment section.
- A `[+]` heading instead creates an editable, unsealed object.
- There is no array-index path syntax.
- There is no element replacement, element deletion, or whole-array clear operation.

---

## 8. Allocation, assignment, seals, and access

### 8.1 Shapes and traversal

Allocation must remain structurally compatible:

- Named intermediate path components must be objects.
- Appends require arrays.
- Established shapes cannot be replaced.
- Traversing a primitive or array as a named intermediate is invalid.

A dotted path cannot traverse a leaf:

```syon
a: 12
a.b: 1              // invalid
```

Allocation alone establishes shape but is not a value assignment.

Operations allocate only the containers needed for their own target: field writes, declarations, appends, and headings allocate as described in their sections. Omitted cells and omitted direct-value rows allocate no column or title-path nodes.

### 8.2 Complete assignment and assignment history

A **complete assignment** writes one whole value at one target path. Complete assignments include:

- ordinary field values;
- container values appended as elements;
- object-map row targets;
- direct-value row targets;
- bare root values.

A plain field target may receive a complete value only once in the document, even if the later value is identical and even after `---`. Paths are compared after decoding quoted segments.

Container-valued fields count as assignments. Literal members and table cells that resolve to values also establish assignment history. A completed named object-map row assigns its row target.

Examples:

```syon
x: 1
x: 1.5              // invalid: duplicate plain field
```

```syon
settings: { timeout: 30 }
---
settings.timeout: 45    // invalid: timeout was assigned as a literal member
settings.enabled: true  // valid: new member
```

A complete assignment cannot replace a nonempty object or array, even if the container arose through navigation or descendant writes rather than a complete assignment at its own path:

```syon
a.b.c: 1
---
a.b: { e: 3 }       // invalid: a.b already contains c
```

```syon
items[]
+ 1
---
items: [2]          // invalid: items is nonempty
```

Explicit appends add fresh elements and do not replace the array.

### 8.3 Assignment history details

- Literal object members establish assignment history recursively.
- Array elements have no user-addressable path; assignment history stops at the array path.
- A named object-map row records its row target and every object-member path in the constructed row.
- A direct-value row records its title path when it writes a value.
- An omitted cell establishes no assignment history.
- A direct-value row that resolves to omission makes no assignment and records no title path.
- Omission contributes no write and allocates no nodes.
- A heading selection is not an assignment.
- An array declaration or opener is not an assignment.
- An append is not a whole-array assignment.

A later section may add a previously absent descendant to an assigned container, but may not assign the container or an existing member again.

### 8.4 First assignment to an empty allocation-only target

An **allocation-only container** is an empty object or array that exists only because allocation created it and has no complete assignment at its own path. Such a container may receive its first complete assignment if:

- it is still empty;
- it has no assignment history at its exact path;
- the new value has the same container shape;
- the path is accessible and unsealed.

This applies to:

- empty objects created by headings;
- empty arrays created by field-array declarations;
- table row targets that are still empty allocation-only objects or arrays of matching shape.

Example:

```syon
# a
---
a: { x: 1 }
```

produces `{"a":{"x":1}}`.

```syon
items[]
---
items: [1]
```

produces `{"items":[1]}`.

It does not apply when the target was explicitly assigned, even as `{}` or `[]`:

```syon
a: {}
---
a: { x: 1 }         // invalid: a was already assigned
```

Once the first assignment occurs, the target is sealed for that section and its assignment history remains.

### 8.5 Container assignments seal until `---`

A complete assignment of an object or array seals that target and its subtree until the next `---`.

```syon
settings: { timeout: 30 }
settings.enabled: true     // invalid: settings is sealed
```

After a boundary:

```syon
settings: { timeout: 30 }
---
settings.enabled: true     // valid: seal reset; new member
```

```syon
items: [1, 2]
items[+]: 3                // invalid: items is sealed

items: [1, 2]
---
items[+]: 3                // valid
```

Rules:

- A seal covers the target and all descendants.
- New field names do not bypass a seal.
- Siblings outside the sealed target remain writable while accessible.
- A scalar assignment does not seal the target; its duplicate protection comes from assignment history.
- Appending a container value seals that element, not the containing array.
- A completed table row seals its row target, not the containing table object or array.
- A `[+]` heading object is editable and unsealed.
- A bare root container initializer seals the root until `---`; a heading does not bypass that seal.
- `***` does not reset seals.
- A schema change does not reset seals.
- A new table does not reset seals.
- Only `---` resets seals.

### 8.6 Closed navigation scopes

Only headings open navigation scopes and only heading changes close them.

Non-heading statements must respect closed scopes:

- a field path cannot enter a closed path;
- an append target cannot be in a closed path;
- an array declaration cannot enter a closed path;
- a table row target cannot enter a closed path;
- an object table cannot start at a closed cursor;
- a direct-value row that resolves to omission still may not enter a closed title path.

A closed path remains inaccessible until `---`. Its data remains in the document.

### 8.7 Table-row target assignment

A table row may assign a complete value at an empty allocation-only target if the normal first-assignment conditions of §8.4 are satisfied.

```syon
# a
---
* $ : v
- a : 1
```

produces `{"a":{"v":1}}`.

A direct-value row follows the same assignment rules. A scalar row value over an empty allocated object is a shape error; an object value is compatible.

### 8.8 Row-local container seals

Inside one table row, a cell that resolves to a container value is a complete value write at that column path. That path seals for the remainder of the row.

Therefore this is invalid:

```syon
items[]
* a | a.b
+ { x: 1 } | 2
```

The first cell writes a container at `a`; the second tries to write beneath it in the same row.

Rules:

- A container-valued cell seals its path for the rest of row construction.
- No later cell may write at or beneath that path in the same row.
- Omission and copied omission contribute no write and create no row-local seal.
- A later cell that writes an ancestor container over a nonempty row subtree is also invalid.
- Sibling columns remain valid.
- The completed row is still assigned and sealed atomically.

### 8.9 Shape conflict examples

```syon
# a
---
a[]                 // invalid: a is an object
```

```syon
a: 12
a.b: 1              // invalid: a is a leaf
```

```syon
a: { b: [1] }
a.b.c: 2            // invalid: b is an array
```

### 8.10 Root write summary

- A root container may be extended after `---` with new fields, headings, or explicit appends.
- Existing root members cannot be assigned again.
- A root array can be selected after `---` with `# []`, then extended with rows or `# [+]`.

```syon
[1, 2]
---
# []
+ 3
```

produces `[1,2,3]`.

- A root scalar is a leaf and cannot be extended or redefined.
- The root never closes, but it can be sealed.

---

## 9. Tables

### 9.1 Table kinds

SYON has two table kinds:

- **array-tuple tables**, whose rows append objects to an array;
- **object-map tables**, whose rows assign named objects or direct values under an object cursor.

Tables do not require a heading. They operate at the current cursor.

### 9.2 Schema syntax

A schema statement begins with `*` followed by one required ASCII space.

The first space separates the marker from the first item and is not part of that item. A tab cannot replace this required space. Additional leading horizontal whitespace is alignment whitespace and is ignored.

Schemas are single-line. Comments may follow.

#### Array-tuple schema

An array-tuple schema contains one or more key-path cells separated by `|`:

```syon
* hostname | port | priority
```

Rules:

- Schema cells are paths, not `key: value` assignments.
- At least one nonempty cell is required.
- A quoted empty key such as `""` is valid.
- An absent or whitespace-only cell is invalid.
- Structural `[]` and `[+]` markers are not allowed in schema column paths.
- Quoted marker-like text is literal.
- A tuple schema requires an active field-array block or the root-array context.
- Only one tuple schema is allowed per array block.
- A tuple schema must appear before any ordinary `+` row, including `+ null` and `+ ^`.
- A preceding `+ ~` row is allowed; a tuple schema may follow one or more `+ ~` rows.
- A tuple schema changes table metadata only. It does not reset heading frames, final-heading-target history, navigation state, seals, or assignment history.

#### Object-map schema

An object-map schema starts with `$`:

```syon
* $ : start_url | post_type | description
```

or uses direct-value mode:

```syon
* $
```

```syon
* $ :
```

```syon
* $:
```

Rules:

- `$` marks the row-title position. It is not a value column and never participates in the group mask.
- A named schema requires a complete list of nonempty value-column paths after `:`.
- The colon is required for a named column list.
- The colon is optional only for the complete-list-empty direct-value form.
- `* $`, `* $:`, and `* $ :` are equivalent direct-value schemas with one value column.
- `* $ name` is not an alternative to `* $ : name`.
- A schema mixing absent cells and named paths, such as `* $ : | name`, is invalid.
- A quoted empty path `""` is a named empty-string key, not an absent column.
- An object-map schema requires an object cursor.
- It ends any active field-array block and opens an object table at the unchanged object cursor.
- At an unallocated root, it establishes an object root even if no rows follow.
- It cannot start on an array or scalar cursor.
- It cannot bypass a sealed root or a closed navigation scope.
- A new object-map schema ends the current object table and starts a new table at the same cursor with fresh group state. It does not reset heading frames, final-heading-target history, navigation state, seals, or assignment history.

Quoted schema paths and row titles:

```syon
# meta
* $ : "" | "literal.dot"
- "row.with.dot" : "empty key" | "literal column"
```

produces:

```json
{
  "meta": {
    "row.with.dot": {
      "": "empty key",
      "literal.dot": "literal column"
    }
  }
}
```

### 9.3 Row syntax

Array rows begin with `+` followed by one required ASCII space.

Object-map rows begin with `-` followed by one required ASCII space.

Rules:

- The first space separates the marker from the first item and is not part of that item.
- A tab cannot replace this required space.
- Additional leading horizontal whitespace is alignment whitespace and is ignored.
- Rows and schemas are single-line.
- `>` continuation is not allowed on any row.
- Comments may follow a row.

Invalid row examples:

```text
+ {
  "x" : 3 // invalid: a row must be one physical line
}

+ >
>"first
> second" // invalid: > continuation is not allowed on a row
```

For N value columns:

- an array-tuple row has exactly N explicit cells and N−1 structural `|` delimiters;
- an object-map named row has exactly N explicit value cells after the title colon;
- a direct-value object-map row has exactly one value cell after the title colon and needs no `|`.

The sole array-row exception is the complete `+ ~` null-element row.

### 9.4 Cell rules

- Cells are separated only by top-level `|`.
- Quoted strings and nested containers do not split cells.
- Horizontal whitespace around structural `|` and the object-map title `:` is alignment and is ignored.
- Whitespace-only cells are invalid, including first and last.
- Missing pipe is not reinterpreted as a cell separator.
- Same-line string concatenation (`"H""i"` or `"H" "i"`) is invalid.
- An unquoted `_` occupying a whole value cell means “omit this column’s write.”
- An unquoted `^` occupying a whole value cell means “copy this column from the group root.”
- Quoted `"_"` and `"^"` are ordinary strings.
- `_` is not a rest-of-row shortcut.
- There are no decorative border pipes, alignment rows, implied trailing cells, or short rows.
- A table cell cannot be empty or whitespace-only.
- A complete `+ ~` row is not a tuple row and is recognized before tuple arity.
- `~` is not an individual table cell value. Its only special use is the complete `+ ~` row.

Examples with a three-column schema:

```text
+ "b" | 80              // invalid: too few cells
+ 1 | 2 | 3 | 4         // invalid: too many cells
+ 1 | | 3               // invalid: empty middle cell
+ | 2 | 3               // invalid: empty first cell
+ 1 | 2 |               // invalid: empty last cell
+ _                     // invalid: one cell, not a three-column omitted row
+                       // invalid: no cell
```

### 9.5 Array-tuple tables

```syon
routeAlternative[]
* hostname | port | priority
+ "a.com" | 12 | 1
+ "b.com" | 13 | 3
```

produces:

```json
{"routeAlternative":[
  {"hostname":"a.com","port":12,"priority":1},
  {"hostname":"b.com","port":13,"priority":3}
]}
```

Tuple mode is allowed in field-array blocks and in the root-array context opened by `# []`.

For a dotted field-array declaration, write:

```syon
Network.Route[]
```

not a named array heading.

A complete dotted declaration:

```syon
edge.routes[]
* path | upstream
+ "/" | "api"
+ "/static" | "cdn"
```

produces:

```json
{
  "edge": {
    "routes": [
      {
        "path": "/",
        "upstream": "api"
      },
      {
        "path": "/static",
        "upstream": "cdn"
      }
    ]
  }
}
```

The root-array form:

```syon
# []
* id | label
+ 1 | "first"
+ 2 | "second"
```

produces:

```json
[
  {
    "id": 1,
    "label": "first"
  },
  {
    "id": 2,
    "label": "second"
  }
]
```

### 9.6 Omission with `_`

An unquoted `_` in a whole value cell omits that column’s write:

```syon
items[]
* a | b | c
+ _ | 2 | _
+ _ | _ | _
```

produces:

```json
{"items":[{"b":2},{}]}
```

For a one-column tuple table:

```syon
items[]
* a
+ _
```

produces `{"items":[{}]}`.

Dotted columns allocate intermediate objects only when their resolved cell contributes a write:

```syon
# []
* a | b | c.x | c.y
+ 1 | 2 | 3 | 4
+ 5 | 6 | _ | _
```

produces:

```json
[
  {"a":1,"b":2,"c":{"x":3,"y":4}},
  {"a":5,"b":6}
]
```

`null` and `""` are explicit values, never omission.

`_` is table-cell syntax and is invalid in plain array rows. `^` is supported in table cells and as a complete plain-array `+ ^` row (§7.5). Neither marker is a general R-value for fields, `key[+]:` appends, root initializers, or nested literal values.

Example with dotted columns and mixed omission, `null`, empty-string, and quoted-pipe cells:

```syon
# inventory
items[]
* sku | price | meta.color | meta.size | note
+ "A-1" | 9.99 | "red" | "M" | _
+ "B-2" | 12.5 | _ | _ | ""
+ "C-3" | null | "blue" | _ | "quoted | pipe"
```

produces:

```json
{
  "inventory": {
    "items": [
      {
        "sku": "A-1",
        "price": 9.99,
        "meta": {
          "color": "red",
          "size": "M"
        }
      },
      {
        "sku": "B-2",
        "price": 12.5,
        "note": ""
      },
      {
        "sku": "C-3",
        "price": null,
        "meta": {
          "color": "blue"
        },
        "note": "quoted | pipe"
      }
    ]
  }
}
```

### 9.7 Object-map tables

```syon
# obj
* $ : a | desc
- x : 1 | "wow"
- y : 0 | "hello"
```

produces:

```json
{"obj":{
  "x":{"a":1,"desc":"wow"},
  "y":{"a":0,"desc":"hello"}
}}
```

A named object-map row assigns a complete row object at its title path.

The row-title cell:

- is a nonempty key path;
- uses the normal bare, quoted, and dotted key-path syntax;
- cannot contain structural array markers;
- cannot be the whole unquoted token `_`, `^`, or `~`;
- may use a quoted key such as `"_"`, `"^"`, or `"~"`.

Dotted row titles may share intermediate ancestors that were not themselves assigned as completed row targets.

All object-map data rows require `:` after the title. Direct-value rows require one value cell after that colon.

Example with dotted row titles sharing an intermediate object:

```syon
# obj
* $ : a | desc
- group.z : 2 | "nested"
- group.w : 3 | "sibling"
```

produces:

```json
{
  "obj": {
    "group": {
      "z": {
        "a": 2,
        "desc": "nested"
      },
      "w": {
        "a": 3,
        "desc": "sibling"
      }
    }
  }
}
```

### 9.8 Direct-value object maps

The schemas `* $` and `* $ :` are equivalent direct-value schemas. They denote one value column: the row value itself.

```syon
* $
- val1 : "log4j"
- val2 : null
- val3 : _
- val4 : 12
- b.c  : _
```

produces:

```json
{"val1":"log4j","val2":null,"val4":12}
```

A direct-value row assigns the resolved value at the title path. An omitted direct-value row makes no assignment and allocates no title-path nodes.

A quoted empty named column is different:

```syon
* $ : ""
- x : 1
```

produces `{"x":{"":1}}`.

Example with dotted and quoted direct-value titles:

```syon
# config
* $
- alpha : true
- beta : null
- gamma : _
- nested.value : 42
- "quoted.key" : "literal dot"
```

produces:

```json
{
  "config": {
    "alpha": true,
    "beta": null,
    "nested": {
      "value": 42
    },
    "quoted.key": "literal dot"
  }
}
```

### 9.9 Grouped `^`

For each table or plain array block, grouping state starts fresh.

An **ordinary row** is:

- a plain array row other than the complete `+ ~` row;
- an array-tuple row;
- an object-map data row;
- a direct-value row;
- any row resolving entirely to omission.

The special `+ ~` row is not an ordinary row.

Track ordinary rows in source order.

#### Group root

The first ordinary row is the group root.

- No cell may be `^`.
- The root records each value column’s concrete value or omission state.
- The root state does not change within the group.
- A group may consist of only its root row; a second row is not required merely to declare a mask.

#### Mask declaration

The second ordinary row declares the group mask.

- A column containing `^` becomes locked.
- A locked column copies the root’s state for the same column in that row.
- A column without `^` stays free for the remainder of the group.
- The mask is fixed until table or array-block end, or a permitted `***` table-group reset.

If the second ordinary row contains no `^`, the mask is empty and no later row in that group may introduce `^`.

#### Later rows

- A locked column must contain exactly `^`; it copies the root’s value or omission. Copying omission performs no write and does not produce `null`.
- A free column must not contain `^`; it must contain an explicit value, explicit `null`, or `_` where table omission is supported.
- A concrete value in a locked column is invalid even if equal to the root value.
- `^` in a free column is invalid.

`^` always copies the group root, never a previous row. Because the mask requires every later row to repeat `^` in exactly the locked columns, the previous ordinary row’s value in a locked column is the same as the group root’s value.

Quoted `"^"` is an ordinary string.

Copied container values are independent values, not aliases.

In a plain array block without a tuple schema, the complete element is one implicit value column. A `+ ^` second ordinary row locks that whole value; all later ordinary rows must keep using `+ ^`. A second ordinary row with an explicit value leaves it free, so later `+ ^` rows are invalid. Plain array blocks do not support omission or `***`; a new block starts with fresh group state (§7.5).

#### Group examples

```syon
items[]
* id | label
+ 1 | "first"
+ ^ | "second"
+ ^ | "third"
```

produces:

```json
{"items":[
  {"id":1,"label":"first"},
  {"id":1,"label":"second"},
  {"id":1,"label":"third"}
]}
```

```syon
items[]
* a | b
+ _ | 1
+ ^ | 2
***
+ 10 | 3
+ ^  | 4
```

produces:

```json
{"items":[
  {"b":1},
  {"b":2},
  {"a":10,"b":3},
  {"a":10,"b":4}
]}
```

The first group locks `a` to absence. The second locks it to `10`.

Invalid plain-array examples follow the same root and row-2 mask rules:

```text
arr[]
+ ^ // invalid (E_GROUP_ROOT): the first ordinary row must supply a value
```

```text
arr[]
+ 1
+ 2
+ ^ // invalid (E_GROUP_MASK): row 2 did not lock the value with ^
```

```text
arr[]
+ 1
+ ^
+ 1 // invalid (E_GROUP_MASK): once locked, later ordinary rows must use ^
```

The second example is still invalid if its second row is `+ 1`: equal explicit values do not establish a copy mask. Blank lines, comments, and `+ ~` do not change which ordinary row declares the mask.

### 9.10 `***` group reset

A standalone `***` inside an active table discards the current group root, ordinary-row count, and mask while preserving:

- the schema;
- the table target context;
- document access rules;
- seals;
- assignment history.

The next ordinary row is a new group root. The ordinary row after it may declare a new mask.

Rules:

- It is written as exactly `***`, with no spaces between the asterisks; a comment may follow.
- `***` is not another schema.
- It does not end the table.
- It does not allocate a node.
- It does not move the cursor.
- It does not end the heading path or close navigation scopes.
- It does not reset heading frames or final-heading-target history.
- It is invalid outside an active table.
- Comments may follow `***`.

Example of `***` resetting an object-map table group:

```syon
# endpoints
* $ : method | path | rateLimit
- health : "GET" | "/health" | _
- metrics : ^ | "/metrics" | 120
*** // new group
- charge : "POST" | "/charge" | 60
- refund : ^ | "/refund" | ^
```

produces:

```json
{
  "endpoints": {
    "health": {
      "method": "GET",
      "path": "/health"
    },
    "metrics": {
      "method": "GET",
      "path": "/metrics",
      "rateLimit": 120
    },
    "charge": {
      "method": "POST",
      "path": "/charge",
      "rateLimit": 60
    },
    "refund": {
      "method": "POST",
      "path": "/refund",
      "rateLimit": 60
    }
  }
}
```

### 9.11 `+ ~` and group counting

`+ ~` appends one `null` array element.

- It is valid with or without a tuple schema.
- It may appear before a tuple schema; a tuple schema may follow it.
- It never becomes a group root.
- It never declares a mask.
- It never counts as a later group member.
- It does not reset group state.
- It is invalid in object-map tables.
- A quoted `"~"` is an ordinary string.

With a schema, `+ null` is an ordinary cell value. In a one-column tuple table, `+ null` writes a `null` field; `+ ~` instead appends a `null` element. Without a schema, both `+ null` and `+ ~` append a `null` element.

They still differ for grouping without a schema: `+ null` can be the group root or declare the row-2 mask, while `+ ~` never participates. Interleaving `+ ~` rows does not make a later `+ ^` legal if the second ordinary row was explicit.

Comments and blank source lines also do not count as rows.

Example with `+ ~` before the schema and between grouped rows:

```syon
# events
events[]
+ ~
+ ~
* kind | message
+ "start" | "boot"
+ ^ | "ready"
+ ~
+ ^ | "stop"
```

produces:

```json
{
  "events": {
    "events": [
      null,
      null,
      {
        "kind": "start",
        "message": "boot"
      },
      {
        "kind": "start",
        "message": "ready"
      },
      null,
      {
        "kind": "start",
        "message": "stop"
      }
    ]
  }
}
```

Example contrasting `+ null` and `+ ~` in a one-column tuple table:

```syon
# values
vals[]
* v
+ null
+ ~
+ "x"
```

produces:

```json
{
  "values": {
    "vals": [
      {
        "v": null
      },
      null,
      {
        "v": "x"
      }
    ]
  }
}
```

### 9.12 Row construction

A value-producing table row is constructed atomically and written once.

1. Resolve each cell’s explicit value, omission, or permitted group-root copy.
2. Construct the complete row value using the schema column paths in column order.
3. Apply duplicate and structural checks.
4. Assign or append the completed row at its row target.

Rules:

- Column paths are used only to construct the row value. They do not independently open or close navigation scopes.
- Returning to a nested object in a later column is valid.
- Container-valued cells seal their path for the remainder of row construction.
- A later sibling column remains valid.
- A later descendant or ancestor conflict is invalid.
- Identical decoded paths may not both contribute writes in one row.
- Duplicate schema paths are allowed when at most one of their cells resolves to a write in each row.
- Grouping does not relax structural or duplicate-write restrictions.
- The complete row is written only after construction. Completed named object-map rows and direct-value rows with container values are sealed according to §9.13; direct scalar rows do not seal.

Named-column row with all cells omitted:

- still assigns `{}`;
- still seals its row target;
- still counts as an ordinary group row.

Direct-value row resolving to omission:

- makes no assignment;
- allocates no title-path nodes;
- still counts as an ordinary group row;
- still may not enter a closed title path or traverse a scalar/array intermediate.

Example with duplicate schema paths and one write per row:

```syon
# dup
rows[]
* k | k | other
+ 1 | _ | "a"
+ _ | 2 | "b"
```

produces:

```json
{
  "dup": {
    "rows": [
      {
        "k": 1,
        "other": "a"
      },
      {
        "k": 2,
        "other": "b"
      }
    ]
  }
}
```

Example returning to a nested object in a later column:

```syon
# obj
* $ : a.x | b | a.y
- row : 1 | "middle" | 2
```

produces:

```json
{
  "obj": {
    "row": {
      "a": {
        "x": 1,
        "y": 2
      },
      "b": "middle"
    }
  }
}
```

Example of an object-map row with all cells omitted:

```syon
# obj
* $ : a | b
- empty : _ | _
- next : 1 | 2
```

produces:

```json
{
  "obj": {
    "empty": {},
    "next": {
      "a": 1,
      "b": 2
    }
  }
}
```

### 9.13 Row targets and sealing

- A completed object-map row seals its row target, not the containing table object or array.
- A tuple row seals the appended element, not the containing array.
- A direct-value row with a container value seals the title target.
- Sibling rows remain possible while the containing path is open.
- A row target may be an empty allocation-only object or array that satisfies §8.4.
- A complete assignment over a nonempty row target is invalid.
- An already-assigned row target cannot be assigned again.
- A later section may add a previously absent descendant but may not assign the row target or an existing member again.

### 9.14 Table placement and lifetime

- Tables are not attached to a preceding field assignment.
- Fields before and after a table use the same cursor.
- A table begins at the current object cursor.
- A table has one schema, zero or more correctly formed rows, and optional `***` separators.
- Blank lines and comments do not end a table.
- The next ordinary non-row statement, heading, `---`, or end of file ends the table.
- A field or `key[+]:` append ends the table and is processed at the unchanged cursor.
- A `key[]` declaration ends the table and opens an array block at the unchanged cursor.
- A malformed row, wrong-kind row, standalone `~`, or invalid table construct is an error, not an escape from table validation.
- A new object-map schema ends the current table and starts a new one at the same cursor.
- A tuple schema in an object table is invalid.
- A `-` row without an object table is invalid.
- A `+` row without an array block or root-array context is invalid.
- A `+` row in an object table is invalid.
- A `-` row in an array table is invalid.
- `***` requires an active table.
- Group state ends with its table.

Example with fields before and after a table:

```syon
# service
name: "gateway"

routes[]
* method | path
+ "GET" | "/health"
+ "POST" | "/charge"

description: "Public API"
```

produces:

```json
{
  "service": {
    "name": "gateway",
    "routes": [
      {
        "method": "GET",
        "path": "/health"
      },
      {
        "method": "POST",
        "path": "/charge"
      }
    ],
    "description": "Public API"
  }
}
```

Example reopening a table in a later section:

```syon
# gateway
routes[]
* path | target
+ "/" | "api"

---
# gateway
routes[]
* path | target
+ "/health" | "health"
```

produces:

```json
{
  "gateway": {
    "routes": [
      {
        "path": "/",
        "target": "api"
      },
      {
        "path": "/health",
        "target": "health"
      }
    ]
  }
}
```

### 9.15 No table-column typing

Tables do not infer or validate column types.

- Free columns may contain different JSON kinds in different rows.
- `_` omits a write rather than supplying a kind.
- `^` enforces the root state only where the mask locks a column.
- Each row is independently constructed.
- Intermediate objects in one row do not impose a shape on another row.
- Copied containers do not create aliases.

Example with mixed cell kinds and container values:

```syon
# mixed
rows[]
* id | payload | meta.kind
+ 1 | { "a": [1, 2] } | "object"
+ 2 | [true, null] | "array"
+ 3 | "text" | _
+ 4 | 3.14 | null
```

produces:

```json
{
  "mixed": {
    "rows": [
      {
        "id": 1,
        "payload": {
          "a": [
            1,
            2
          ]
        },
        "meta": {
          "kind": "object"
        }
      },
      {
        "id": 2,
        "payload": [
          true,
          null
        ],
        "meta": {
          "kind": "array"
        }
      },
      {
        "id": 3,
        "payload": "text"
      },
      {
        "id": 4,
        "payload": 3.14,
        "meta": {
          "kind": null
        }
      }
    ]
  }
}
```

---

## 10. Sections

A line whose statement content is `---` starts a new section.

A leading `---` is allowed. It still counts as a section boundary for purposes of bare root initialization, but it does not establish root shape.

At a section boundary:

- the cursor returns to the root;
- heading frames are cleared;
- active array blocks and tables end;
- navigation-open and closed state is cleared;
- final-heading-target history is cleared;
- assignment seals are cleared;
- the next statements form a fresh implicit root body.

The following are preserved:

- existing data;
- root shape;
- container shapes;
- array elements;
- document-wide assignment history.

`---` does not make duplicate assignments legal. It does not permit assigning over a populated container.

Examples:

```syon
# settings
timeout: 30
---
# settings
enabled: true
```

produces:

```json
{"settings":{"timeout":30,"enabled":true}}
```

Writing `timeout: 45` in the second section is still invalid.

After `---`, the cursor is the root. If the root is absent, object-establishing statements such as fields may create an object root. If the root is an object, fields operate there. A root array requires `# []`, and a root scalar is a leaf. Relative headings immediately after `---` are orphans.

A boundary does not itself open an array block. A following `+` is orphaned even when the root is an array; select the root array with `# []` first.

A bare root R-value is invalid after any `---`, even if the root is still absent.

`---` has no document-level meaning inside a quoted string, a container value, or a `>` payload.

`***` is not a section boundary.

---

## 11. Complete examples

### 11.1 Headings, implicit objects, and tables

```syon
# application
name: "edge-gateway"
_env: 'production'
tags[+]: "eu-west"
tags[+]: "tier-1"

database.host: "db.internal"

## database
pool: 8
timeout: 30

### replicas[+]
region: "eu-west-1"
readOnly: true

### replicas[+]
region: "eu-central-1"
readOnly: false

# endpoints
* $       : method | path       | rateLimit
- health  : "GET"  | "/health"  | _
- metrics : ^      | "/metrics" | 120
***
- charge  : "POST" | "/charge"  | 60

# jobs
queue[]
* name    | workers | enabled
+ "build" | 4       | true
+ "test"  | ^       | false
+ "lint"  | ^       | true
```

produces:

```json
{
  "application": {
    "name": "edge-gateway",
    "tags": ["eu-west", "tier-1"],
    "_env": "production",
    "database": {
      "host": "db.internal",
      "pool": 8,
      "timeout": 30,
      "replicas": [
        {"region": "eu-west-1", "readOnly": true},
        {"region": "eu-central-1", "readOnly": false}
      ]
    }
  },
  "endpoints": {
    "health": {"method": "GET", "path": "/health"},
    "metrics": {"method": "GET", "path": "/metrics", "rateLimit": 120},
    "charge": {"method": "POST", "path": "/charge", "rateLimit": 60}
  },
  "jobs": {
    "queue": [
      {"name": "build", "workers": 4, "enabled": true},
      {"name": "test", "workers": 4, "enabled": false},
      {"name": "lint", "workers": 4, "enabled": true}
    ]
  }
}
```

### 11.2 Servlet-style nested configuration

```syon
web-app.servlet-mapping.abc: "/abc/*"
x : 10

# web-app.servlet[+]
servlet-name: "cofaxABC"
servlet-class: "org.cofax.cms.CofaxABCServlet"

## init-param
run-retry: 3
longStr : >
>"First line
> arg 12 13"
```

produces:

```json
{
  "web-app": {
    "servlet-mapping": {
      "abc": "/abc/*"
    },
    "servlet": [
      {
        "servlet-name": "cofaxABC",
        "servlet-class": "org.cofax.cms.CofaxABCServlet",
        "init-param": {
          "run-retry": 3,
          "longStr": "First line\narg 12 13"
        }
      }
    ]
  },
  "x": 10
}
```

### 11.3 Grouped array table

```syon
items[]
* id | label
+ 1 | "first"
+ ^ | "second"
+ ^ | "third"
***
+ 2 | "other"
+ ^ | "value"
```

produces:

```json
{
  "items": [
    {"id": 1, "label": "first"},
    {"id": 1, "label": "second"},
    {"id": 1, "label": "third"},
    {"id": 2, "label": "other"},
    {"id": 2, "label": "value"}
  ]
}
```

### 11.4 Root array

```syon
# []
* id | name
+ 1 | "first"
+ 2 | "second"
```

produces:

```json
[
  {"id": 1, "name": "first"},
  {"id": 2, "name": "second"}
]
```

### 11.5 Root assignment and later extension

```syon
{ name: "web", ports: [8080] }
---
enabled: true
```

produces:

```json
{"name":"web","ports":[8080],"enabled":true}
```

### 11.6 Reassignment protection

```syon
settings: { timeout: 30 }
---
settings.timeout: 45      // invalid duplicate
settings.enabled: true    // valid new member
```

`settings.timeout: 45` is invalid; `settings.enabled: true` would be valid by itself.

---

*SYON V0.1 — Synthesized Object Notation*
