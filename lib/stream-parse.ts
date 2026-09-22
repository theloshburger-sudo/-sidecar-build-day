// Incrementally pulls complete board actions out of a streaming JSON tutor turn,
// so Teacher can start talking and drawing before Claude has finished the reply.

/** Marks an error inside a streamed tutor reply (after a 200 has already been sent). */
export const STREAM_ERROR = "\u0000ERR ";

export class BoardStreamParser {
  private buf = "";
  private pos = 0;
  private arrayStart = -1;
  private done = false;
  private depth = 0;
  private inString = false;
  private escape = false;
  private objStart = -1;

  /** Feed more text; returns any board actions that just became complete. */
  feed(chunk: string): Record<string, unknown>[] {
    this.buf += chunk;
    const out: Record<string, unknown>[] = [];
    if (this.done) return out;
    if (this.arrayStart < 0) {
      const m = /"board"\s*:\s*\[/.exec(this.buf);
      if (!m) return out;
      this.arrayStart = m.index + m[0].length;
      this.pos = this.arrayStart;
    }
    for (; this.pos < this.buf.length; this.pos++) {
      const c = this.buf[this.pos];
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (c === "\\") this.escape = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (c === '"') this.inString = true;
      else if (c === "{" || c === "[") {
        if (this.depth === 0 && c === "{") this.objStart = this.pos;
        this.depth++;
      } else if (c === "}" || c === "]") {
        if (this.depth === 0 && c === "]") {
          this.done = true;
          this.pos++;
          break;
        }
        this.depth--;
        if (this.depth === 0 && c === "}" && this.objStart >= 0) {
          try {
            out.push(JSON.parse(this.buf.slice(this.objStart, this.pos + 1)));
          } catch {
            /* skip malformed action */
          }
          this.objStart = -1;
        }
      }
    }
    return out;
  }

  get text() {
    return this.buf;
  }
}
