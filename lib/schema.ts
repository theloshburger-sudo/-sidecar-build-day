// JSON schemas for Claude structured outputs (output_config.format).

const str = { type: "string" };
const num = { type: "number" };
const strArr = { type: "array", items: str };

// Structured outputs allow at most 24 optional parameters per request, so every
// variant below lists ALL its fields as required ("" / [] mean "not used").
const zone = { type: "string", enum: ["left", "right", "full"] };
const color = { type: "string", enum: ["ink", "blue", "green", "red", "purple", "orange"] };
const size = { type: "string", enum: ["sm", "md", "lg"] };

function variant(type: string | string[], props: Record<string, unknown>) {
  const properties = { type: Array.isArray(type) ? { type: "string", enum: type } : { type: "string", const: type }, ...props };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

export const boardActionSchema = {
  anyOf: [
    variant("write", { id: str, text: str, zone, size, color }),
    variant("askQuestion", { text: str }),
    variant("balance", { target: str, text: str }),
    variant(["circle", "underline", "highlight", "strike"], { target: str, match: str, text: str, color }),
    variant("arrow", { from: str, to: str, text: str, color }),
    variant("drawLine", { x1: num, y1: num, x2: num, y2: num, color }),
    variant(["box", "note"], { id: str, text: str, items: strArr, zone, color }),
    variant("divider", { zone }),
    variant("graph", { id: str, zone, xMin: num, xMax: num, yMin: num, yMax: num, xLabel: str, yLabel: str, text: str }),
    variant("plot", { target: str, fn: str, items: strArr, text: str, color }),
    variant("point", { target: str, x: num, y: num, text: str }),
    variant("graphArrow", { target: str, x1: num, y1: num, x2: num, y2: num, text: str }),
    variant("table", { id: str, headers: strArr, rows: { type: "array", items: strArr }, zone }),
    variant("tAccount", { id: str, text: str, debits: strArr, credits: strArr }),
    variant("timeline", { id: str, text: str, items: strArr }),
    variant("numberLine", { id: str, zone, xMin: num, xMax: num, text: str, items: strArr }),
    variant("interval", { target: str, text: str, color }),
    variant(["flow", "mindmap"], { id: str, text: str, items: strArr, zone, color }),
    variant("add", { target: str, text: str, color }),
    variant("canvas", { id: str, zone, text: str }),
    variant("sketch", {
      id: str,
      target: str,
      kind: { type: "string", enum: ["circle", "dot", "rect", "line", "arrow", "arc", "polygon", "text"] },
      x: num,
      y: num,
      x2: num,
      y2: num,
      r: num,
      text: str,
      items: strArr,
      color,
    }),
    variant("pointTo", { target: str, match: str, text: str }),
    variant("narrate", { text: str }),
    variant("clear", {}),
  ],
} as const;

export const tutorTurnSchema = {
  type: "object",
  additionalProperties: false,
  // board comes first so it streams first: Teacher starts talking and drawing while the rest arrives.
  required: ["board", "say", "phase", "question", "choices", "gap", "plan", "step", "videos", "practice", "verdict", "insight"],
  properties: {
    board: { type: "array", items: boardActionSchema },
    say: str,
    phase: { type: "string", enum: ["diagnose", "teach", "check", "practice", "wrapup"] },
    question: str,
    choices: strArr,
    gap: str,
    plan: strArr,
    step: { type: "integer" },
    videos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "query"],
        properties: { title: str, query: str },
      },
    },
    practice: str,
    verdict: { type: "string", enum: ["none", "correct", "partial", "incorrect"] },
    insight: str,
  },
} as const;

export const extractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assignmentName", "problems"],
  properties: {
    assignmentName: str,
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text", "subject"],
        properties: { title: str, text: str, subject: str },
      },
    },
  },
} as const;
