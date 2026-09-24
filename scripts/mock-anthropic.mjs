// A tiny stand-in for the Anthropic Messages API, for testing the live code path
// without a key. Run: node scripts/mock-anthropic.mjs [port] [logFile]
// Then start the app with ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:<port>
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";

const port = Number(process.argv[2] || 4010);
const log = process.argv[3];
const REJECT_SCHEMA_ONCE = process.env.MOCK_REJECT_SCHEMA === "1";
let rejected = false;
// MOCK_OVERLOAD=n: the first n streamed calls fail with an overloaded_error event before any text.
let overloads = Number(process.env.MOCK_OVERLOAD || 0);
let turnNo = 0;

const numberLineTurn = {
  say: "Hey! Let's map I and J on a number line first.",
  phase: "diagnose",
  board: [
    { type: "write", id: "i", text: "I = (0, 3]", zone: "left", size: "lg", color: "blue" },
    { type: "write", id: "j", text: "J = (−3, 2)", zone: "left", size: "lg", color: "orange" },
    { type: "numberLine", id: "nl", zone: "full", xMin: -4, xMax: 4, text: "Number line", items: ["I: (0, 3]", "J: (−3, 2)"] },
    { type: "circle", target: "i", match: "(", text: "open: 0 not in I", color: "red" },
  ],
  question: "On the number line, does I include the point 0 or not?",
  choices: ["Yes, 0 is included in I", "No, 0 is NOT included in I", "Not sure what the brackets mean"],
  gap: "", plan: [], step: 0, videos: [], practice: "", verdict: "none",
};

const turns = process.env.MOCK_NUMBERLINE === "1" ? [numberLineTurn] : [
  {
    say: "",
    phase: "diagnose",
    board: [
      { type: "narrate", text: "Hi! Here's the parabola we're working with." },
      { type: "write", id: "eq", text: "y = x² − 4x + 1", zone: "left", size: "lg", color: "ink" },
      { type: "narrate", text: "Let me sketch it on a graph so we can see its shape." },
      { type: "graph", id: "g1", zone: "right", xMin: -2, xMax: 6, yMin: -4, yMax: 6, xLabel: "x", yLabel: "y", text: "" },
      { type: "plot", target: "g1", fn: "x^2-4x+1", items: [], text: "y", color: "blue" },
    ],
    question: "What does the vertex of a parabola mean to you?",
    choices: ["The highest or lowest point", "Where it crosses the x-axis", "Not sure"],
    gap: "", plan: [], step: 0, videos: [], practice: "", verdict: "none",
  },
  {
    say: "Exactly. For y equals a x squared plus b x plus c, the vertex x-value is negative b over 2a.",
    phase: "teach",
    board: [
      { type: "circle", target: "eq", match: "−4x", text: "b = −4", color: "red" },
      { type: "note", id: "rule", text: "Vertex x = −b ÷ 2a", items: ["a = 1, b = −4"], zone: "left", color: "ink" },
      { type: "point", target: "g1", x: 2, y: -3, text: "" },
    ],
    question: "What is −b ÷ 2a here?",
    choices: [], gap: "Vertex formula x = −b/2a", plan: ["Find a and b", "Use −b/2a", "Plug in for y"], step: 1,
    videos: [{ title: "Vertex of a parabola", query: "find vertex of parabola -b/2a" }], practice: "", verdict: "correct",
  },
];
if (process.env.MOCK_NUMBERLINE === "1") turns.length = 1;
// MOCK_TURNS=path.json replays a scripted conversation (used for teaching evaluations).
if (process.env.MOCK_TURNS) turns.splice(0, turns.length, ...JSON.parse(readFileSync(process.env.MOCK_TURNS, "utf8")));

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = body ? JSON.parse(body) : {};
    const hasFormat = Boolean(json.output_config?.format);
    if (log) appendFileSync(log, JSON.stringify({ path: req.url, model: json.model, effort: json.output_config?.effort, hasFormat, nMessages: json.messages?.length, lastRole: json.messages?.at(-1)?.role }) + "\n");
    if (REJECT_SCHEMA_ONCE && hasFormat && !rejected) {
      rejected = true;
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Schema is too complex for compilation." } }));
    }
    const isExtract = /split it into problems|Transcribe and split/i.test(JSON.stringify(json.messages ?? []));
    const payload = isExtract
      ? { assignmentName: "Homework 5", problems: [{ title: "1. Solve 5x − 4 = 21", text: "1. Solve 5x − 4 = 21", subject: "Algebra" }] }
      : turns[Math.min(turnNo++, turns.length - 1)];
    const text = hasFormat ? JSON.stringify(payload) : "```json\n" + JSON.stringify(payload) + "\n```";
    if (log) appendFileSync(log, JSON.stringify({ stream: Boolean(json.stream), image: JSON.stringify(json.messages ?? []).includes('"type":"image"'), cached: JSON.stringify(json.system ?? "").includes("cache_control") }) + "\n");
    if (json.stream && overloads > 0) {
      overloads--;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`);
      return res.end();
    }
    if (json.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev("message_start", { message: { id: "msg_mock", type: "message", role: "assistant", content: [], model: json.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      const parts = text.match(/[\s\S]{1,40}/g) ?? [];
      let i = 0;
      const tick = () => {
        if (i < parts.length) {
          ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: parts[i++] } });
          return setTimeout(tick, 30);
        }
        ev("content_block_stop", { index: 0 });
        ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
        ev("message_stop", {});
        res.end();
      };
      return setTimeout(tick, 300);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_mock", type: "message", role: "assistant", model: json.model,
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }));
  });
}).listen(port, () => console.log(`mock anthropic on :${port}`));
