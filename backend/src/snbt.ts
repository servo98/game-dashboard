/**
 * SNBT (Stringified NBT) parser for FTB Quests data files.
 *
 * Handles:
 * - Newlines as separators (no commas required)
 * - Typed suffixes: 1L (long), 1.0d (double), 1.0f (float), 1b (byte), 1s (short)
 * - Typed arrays: [I; 1, 2], [L; 1L, 2L], [B; 1b, 2b]
 * - Quoted strings (double-quoted with escape sequences)
 * - Bare identifiers (unquoted strings)
 * - Comments starting with #
 */

type SNBTValue = string | number | boolean | SNBTValue[] | { [key: string]: SNBTValue };

class SNBTParser {
  private pos = 0;
  private input = "";

  parse(input: string): SNBTValue {
    this.input = input;
    this.pos = 0;
    this.skipWhitespaceAndComments();
    const result = this.parseValue();
    this.skipWhitespaceAndComments();
    return result;
  }

  private parseValue(): SNBTValue {
    this.skipWhitespaceAndComments();
    const ch = this.peek();

    if (ch === "{") return this.parseCompound();
    if (ch === "[") return this.parseListOrArray();
    if (ch === '"') return this.parseQuotedString();

    return this.parsePrimitive();
  }

  private parseCompound(): Record<string, SNBTValue> {
    this.expect("{");
    const result: Record<string, SNBTValue> = {};

    this.skipWhitespaceAndComments();
    while (this.peek() !== "}") {
      const key = this.parseKey();
      this.skipWhitespaceAndComments();
      this.expect(":");
      this.skipWhitespaceAndComments();
      const value = this.parseValue();
      result[key] = value;

      this.skipWhitespaceAndComments();
      // Skip optional comma or newline separator
      if (this.peek() === ",") this.advance();
      this.skipWhitespaceAndComments();
    }

    this.expect("}");
    return result;
  }

  private parseListOrArray(): SNBTValue[] {
    this.expect("[");
    this.skipWhitespaceAndComments();

    // Check for typed array prefix: [I; ...], [L; ...], [B; ...]
    if (
      this.pos + 1 < this.input.length &&
      "ILB".includes(this.input[this.pos]) &&
      this.input[this.pos + 1] === ";"
    ) {
      this.advance(); // skip type char
      this.advance(); // skip ;
    }

    const items: SNBTValue[] = [];
    this.skipWhitespaceAndComments();

    while (this.peek() !== "]") {
      items.push(this.parseValue());
      this.skipWhitespaceAndComments();
      if (this.peek() === ",") this.advance();
      this.skipWhitespaceAndComments();
    }

    this.expect("]");
    return items;
  }

  private parseQuotedString(): string {
    this.expect('"');
    let result = "";
    while (this.pos < this.input.length && this.input[this.pos] !== '"') {
      if (this.input[this.pos] === "\\") {
        this.advance();
        const esc = this.input[this.pos];
        switch (esc) {
          case "n":
            result += "\n";
            break;
          case "t":
            result += "\t";
            break;
          case "r":
            result += "\r";
            break;
          case '"':
            result += '"';
            break;
          case "\\":
            result += "\\";
            break;
          default:
            result += esc;
        }
      } else {
        result += this.input[this.pos];
      }
      this.advance();
    }
    this.expect('"');
    return result;
  }

  private parseKey(): string {
    this.skipWhitespaceAndComments();
    if (this.peek() === '"') return this.parseQuotedString();
    return this.parseBareWord(true);
  }

  private parseBareWord(isKey = false): string {
    // Keys stop at ':' (key-value separator), values allow ':' (e.g. minecraft:diamond)
    const stopChars = isKey ? '{}[],:"#' : '{}[],"#';
    let word = "";
    while (
      this.pos < this.input.length &&
      !this.isWhitespace(this.input[this.pos]) &&
      !stopChars.includes(this.input[this.pos])
    ) {
      word += this.input[this.pos];
      this.advance();
    }
    return word;
  }

  private parsePrimitive(): SNBTValue {
    const raw = this.parseBareWord(false);

    if (raw === "") {
      throw new Error(
        `SNBT: unexpected character '${this.input[this.pos]}' at position ${this.pos}`,
      );
    }

    // Boolean
    if (raw === "true") return true;
    if (raw === "false") return false;

    // Typed numbers — check suffix first
    const lastChar = raw[raw.length - 1];
    const numPart = raw.slice(0, -1);

    if ((lastChar === "b" || lastChar === "B") && numPart !== "" && isFiniteNumber(numPart)) {
      // Byte: 1b — but also handle "true"/"false" byte aliases
      if (numPart === "0") return 0;
      if (numPart === "1") return 1;
      return Number(numPart);
    }

    if ((lastChar === "s" || lastChar === "S") && numPart !== "" && isFiniteNumber(numPart)) {
      return Number(numPart); // Short: 1s
    }

    if ((lastChar === "l" || lastChar === "L") && numPart !== "" && isFiniteNumber(numPart)) {
      // Long: use number if safe, otherwise keep as number (could lose precision)
      const n = Number(numPart);
      return n;
    }

    if ((lastChar === "f" || lastChar === "F") && numPart !== "" && isFiniteNumber(numPart)) {
      return Number(numPart); // Float: 1.0f
    }

    if ((lastChar === "d" || lastChar === "D") && numPart !== "" && isFiniteNumber(numPart)) {
      return Number(numPart); // Double: 1.0d
    }

    // Plain number
    if (isFiniteNumber(raw)) {
      return Number(raw);
    }

    // Bare string identifier
    return raw;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (this.isWhitespace(ch)) {
        this.advance();
        continue;
      }
      if (ch === "#") {
        // Skip to end of line
        while (this.pos < this.input.length && this.input[this.pos] !== "\n") {
          this.advance();
        }
        continue;
      }
      break;
    }
  }

  private isWhitespace(ch: string): boolean {
    return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  }

  private peek(): string {
    return this.input[this.pos] ?? "";
  }

  private advance(): void {
    this.pos++;
  }

  private expect(ch: string): void {
    if (this.input[this.pos] !== ch) {
      throw new Error(
        `SNBT: expected '${ch}' but got '${this.input[this.pos] ?? "EOF"}' at position ${this.pos}`,
      );
    }
    this.advance();
  }
}

function isFiniteNumber(s: string): boolean {
  if (s === "" || s === "-" || s === "+") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

const parserInstance = new SNBTParser();

export function parseSNBT(input: string): Record<string, SNBTValue> {
  const result = parserInstance.parse(input);
  if (typeof result !== "object" || Array.isArray(result)) {
    throw new Error("SNBT: top-level value must be a compound (object)");
  }
  return result as Record<string, SNBTValue>;
}

export type { SNBTValue };
