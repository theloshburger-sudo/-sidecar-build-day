// Groups board actions into "beats": one short spoken line + exactly the strokes drawn
// while it's said. This keeps what Teacher says in step with what Teacher draws.

import type { BoardAction, TutorTurn } from "./types";

export interface Beat {
  text: string;
  actions: BoardAction[];
}

/** Builds beats incrementally as actions stream in. A "narrate" action starts a new beat. */
export class BeatBuilder {
  beats: Beat[] = [];
  closed = 0; // beats[0..closed) are final

  push(a: BoardAction) {
    if (a.type === "narrate") {
      if (this.beats.length) this.closed = this.beats.length;
      this.beats.push({ text: String(a.text ?? "").trim(), actions: [] });
      return;
    }
    if (!this.beats.length) this.beats.push({ text: "", actions: [] });
    this.beats[this.beats.length - 1].actions.push(a);
  }

  end() {
    this.closed = this.beats.length;
  }
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/** For turns without narrate steps (demo scripts, older replies): pair sentences with slices of the drawing. */
export function beatsFromTurn(turn: Pick<TutorTurn, "say" | "board">): Beat[] {
  if (turn.board.some((a) => a.type === "narrate")) {
    const b = new BeatBuilder();
    turn.board.forEach((a) => b.push(a));
    b.end();
    return b.beats;
  }
  const lines = sentences(turn.say);
  const acts = turn.board;
  if (lines.length <= 1) return [{ text: turn.say.trim(), actions: acts }];
  // A "clear" always belongs to the first beat so the board wipes before we talk about new things.
  const beats: Beat[] = lines.map((text) => ({ text, actions: [] }));
  const per = acts.length / lines.length;
  acts.forEach((a, i) => {
    const idx = a.type === "clear" ? 0 : Math.min(lines.length - 1, Math.floor(i / Math.max(per, 1e-9)));
    beats[idx].actions.push(a);
  });
  return beats;
}

/** The spoken text of a turn (joined narrate lines, or `say`). */
export function spokenText(turn: Pick<TutorTurn, "say" | "board">): string {
  const lines = turn.board.filter((a) => a.type === "narrate").map((a) => String(a.text ?? "").trim()).filter(Boolean);
  return lines.length ? lines.join(" ") : turn.say;
}
