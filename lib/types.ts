// Shared types between the browser, the API routes and the demo engine.

export type Zone = "left" | "right" | "full";
export type InkColor = "ink" | "blue" | "green" | "red" | "purple" | "orange";
export type TextSize = "sm" | "md" | "lg";

export type BoardActionType =
  | "write"
  | "balance"
  | "circle"
  | "underline"
  | "highlight"
  | "strike"
  | "arrow"
  | "drawLine"
  | "box"
  | "note"
  | "divider"
  | "graph"
  | "plot"
  | "point"
  | "graphArrow"
  | "table"
  | "tAccount"
  | "timeline"
  | "numberLine"
  | "interval"
  | "flow"
  | "canvas"
  | "sketch"
  | "mindmap"
  | "add"
  | "pointTo"
  | "screenMark"
  | "narrate"
  | "askQuestion"
  | "clear";

/**
 * One whiteboard instruction. The schema is intentionally flat: every action is a
 * `type` plus whichever optional fields that type uses. That keeps Claude's structured
 * output simple and lets the client ignore fields it doesn't need.
 */
export interface BoardAction {
  type: BoardActionType;
  /** Name for this element so later actions can point at it (circle, arrow, plot...). */
  id?: string;
  text?: string;
  /** id of an existing element to act on. */
  target?: string;
  /** Exact substring inside the target text to mark (e.g. "3x"). */
  match?: string;
  from?: string;
  to?: string;
  zone?: Zone;
  color?: InkColor;
  size?: TextSize;
  /** Raw board coordinates (board is 1000 wide) for drawLine, or graph coordinates for graphArrow. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** point x/y in graph coordinates. */
  x?: number;
  y?: number;
  /** Graph ranges. */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
  /** sketch: shape kind (circle, dot, rect, line, arrow, arc, polygon, text) and radius. */
  kind?: string;
  r?: number;
  /** Math expression in x for plot, e.g. "(x-2)^2 + 1". */
  fn?: string;
  /** List content for box / timeline ("label: detail") / note bullets. */
  items?: string[];
  headers?: string[];
  rows?: string[][];
  debits?: string[];
  credits?: string[];
}

export type Phase = "warmup" | "diagnose" | "teach" | "check" | "practice" | "wrapup";
export type Verdict = "none" | "correct" | "partial" | "incorrect";

export interface VideoSuggestion {
  title: string;
  query: string;
}

/** Everything the tutor produces in one turn. */
export interface TutorTurn {
  say: string;
  phase: Phase;
  board: BoardAction[];
  question: string;
  choices: string[];
  gap: string;
  plan: string[];
  step: number;
  videos: VideoSuggestion[];
  practice: string;
  verdict: Verdict;
  /** One new observation about how this student learns best ("" if nothing new). */
  insight: string;
  /** Stable key for the missing concept, set together with gap (empty until known). */
  concept: ConceptKey;
}

/** A concept as the tutor names it: kebab-case slug + a short human label. */
export interface ConceptKey {
  slug: string;
  label: string;
}

export type TeachingFormat = "visual" | "example" | "analogy" | "socratic";

export interface Preferences {
  format: TeachingFormat;
  voice: boolean;
  focus: boolean;
  pace: "normal" | "slow";
  /** Drawing speed multiplier (0.25–2), or 0 for "Auto": paced to match the voice. */
  speed: number;
  /** Voice speed multiplier (0.75–1.5). */
  voiceSpeed: number;
  /** Who Teacher sounds like: a natural voice id (see lib/voices) or "browser:<name>". */
  voiceName?: string;
}

export interface Problem {
  id: string;
  title: string;
  text: string;
  subject: string;
}

export interface Assignment {
  name: string;
  problems: Problem[];
  /** Set for built-in demo assignments, which can run fully offline. */
  demoId?: string;
}

export type ChatEntry =
  | { role: "tutor"; turn: TutorTurn }
  | { role: "student"; text: string };

export interface TutorRequest {
  problem: Problem;
  preferences: Preferences;
  history: ChatEntry[];
  /** Compact description of what's currently drawn, so Claude can reference ids. */
  boardSummary: string;
  studentMessage: string;
  /** JPEG data URL of the whiteboard when the student drew on it. */
  image?: string;
  /** What Teacher has learned about this student (on-device for guests, in their account when signed in). */
  learner?: string[];
  /** Concepts this student has missed before, so Teacher reuses the same slug for the same idea. */
  concepts?: ConceptKey[];
  /** One concept due for spaced review: Teacher opens with a one-question warm-up on it. */
  review?: ConceptKey;
  /** JPEG data URL of the student's shared screen right now (screen-follow). */
  screen?: string;
  /** Pixel size of that screenshot: screenMark coordinates are in these pixels. */
  screenSize?: { w: number; h: number };
  /** Earlier views of the same page while the student scrolled (page memory), oldest first. */
  screenViews?: string[];
  /** Zoomed-in quarters of the same screen, for reading small text. */
  screenTiles?: { url: string; x: number; y: number; w: number; h: number }[];
}
