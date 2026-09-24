// Builds scripted tutor turns (docs/eval/sim/*.json) for replaying the eval sessions through
// scripts/mock-anthropic.mjs when no ANTHROPIC_API_KEY is available. Each turn was written by
// following lib/prompt.ts (TUTOR_SYSTEM) beat by beat; every action carries all schema fields.
// Run: node scripts/eval-sim-turns.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const N = (text) => ({ type: "narrate", text });
const write = (id, text, zone = "left", size = "md", color = "ink") => ({ type: "write", id, text, zone, size, color });
const mark = (type, target, match, text = "", color = "red") => ({ type, target, match, text, color });
const P = (target, match, text) => ({ type: "pointTo", target, match, text });
const balance = (target, text) => ({ type: "balance", target, text });
const box = (id, text, items, zone = "left", color = "ink", type = "box") => ({ type, id, text, items, zone, color });
const arrow = (from, to, text = "", color = "blue") => ({ type: "arrow", from, to, text, color });
const divider = (zone = "left") => ({ type: "divider", zone });
const ask = (text) => ({ type: "askQuestion", text });
const graph = (id, zone, xMin, xMax, yMin, yMax, xLabel, yLabel, text) => ({ type: "graph", id, zone, xMin, xMax, yMin, yMax, xLabel, yLabel, text });
const plot = (target, fn, text, color, items = []) => ({ type: "plot", target, fn, items, text, color });
const point = (target, x, y, text) => ({ type: "point", target, x, y, text });
const garrow = (target, x1, y1, x2, y2, text) => ({ type: "graphArrow", target, x1, y1, x2, y2, text });
const tacct = (id, text, debits, credits) => ({ type: "tAccount", id, text, debits, credits });
const timeline = (id, text, items) => ({ type: "timeline", id, text, items });
const flow = (id, text, zone = "full", color = "ink") => ({ type: "flow", id, text, items: [], zone, color });
const add = (target, text, color = "ink") => ({ type: "add", target, text, color });
const canvas = (id, zone, text) => ({ type: "canvas", id, zone, text });
const sk = (id, target, kind, o = {}) => ({ type: "sketch", id, target, kind, x: 0, y: 0, x2: 0, y2: 0, r: 0, text: "", items: [], color: "ink", ...o });

const turn = (board, o = {}) => ({
  board,
  say: "",
  phase: "teach",
  question: "",
  choices: [],
  gap: "",
  plan: [],
  step: 0,
  videos: [],
  practice: "",
  verdict: "none",
  insight: "",
  ...o,
});

const sessions = {
  // 1. Algebra -------------------------------------------------------------------------
  algebra: [
    turn(
      [
        N("Hi! Here's the equation we're solving. Our job is to get x all by itself."),
        write("eq1", "3x + 7 = 22", "left", "lg"),
        N("Two things happened to x here: it got multiplied by 3, then 7 got added."),
        P("eq1", "3x", "times 3"),
        P("eq1", "+ 7", "then + 7"),
        N("Where does it get tricky for you?"),
      ],
      { phase: "diagnose", question: "Where are you stuck?", choices: ["I don't know how to start", "I get stuck after one step", "Can you check my answer?"] },
    ),
    turn(
      [
        N("We undo things in reverse order, like taking off your shoes before your socks. The plus 7 was done last, so it goes first."),
        mark("circle", "eq1", "+ 7", "undo first"),
        N("To undo plus 7, we take 7 away from BOTH sides, so the equation stays balanced."),
        balance("eq1", "− 7"),
        N("Your turn: what does the right side become? What's 22 minus 7?"),
        P("eq1", "22", "your turn"),
      ],
      { question: "Your turn: what is 22 − 7? Write the new equation.", plan: ["Undo + 7", "Undo × 3", "Check"], step: 0, gap: "" },
    ),
    turn(
      [
        N("Close, but 29 is what we'd get if we added 7. We're taking 7 away."),
        P("eq1", "22", "22 − 7"),
        N("Think of 22 steps forward, then 7 steps back. Where do you land?"),
        write("h1", "22 − 7 = ?", "left", "md", "orange"),
      ],
      { phase: "check", verdict: "incorrect", question: "Your turn: 22 − 7 = ?", gap: "Inverse operations: undo + 7 by subtracting 7", insight: "Mixes up adding and subtracting when undoing" },
    ),
    turn(
      [
        N("Great question. The equals sign is like a balance scale: whatever we do to one side, we do to the other, so it stays level."),
        box("why", "Balance rule", ["Same move on both sides", "Undo the LAST thing first"], "right", "blue", "note"),
        N("We subtract 7 because it's the opposite of plus 7. It cancels the 7 on the left and leaves just 3x."),
        P("eq1", "+ 7", "cancels out"),
        N("So now, 22 take away 7 is what?"),
        P("h1", "?", "your turn"),
      ],
      { question: "Your turn: 22 − 7 = ?", insight: "Wants the reason behind each step" },
    ),
    turn(
      [
        N("Yes, 15. So now we have 3x equals 15."),
        write("eq2", "3x = 15", "left", "lg", "green"),
        N("x is still being multiplied by 3, so what's the opposite of times 3?"),
        P("eq2", "3x", "× 3 left"),
      ],
      { phase: "check", verdict: "correct", question: "Your turn: undo the × 3. What is x?", step: 1 },
    ),
    turn(
      [
        N("Exactly! Divide both sides by 3, and x equals 5."),
        balance("eq2", "÷ 3"),
        write("eq3", "x = 5", "left", "lg", "green"),
        N("Let's check: 3 times 5 is 15, plus 7 is 22. It works."),
        write("chk", "3(5) + 7 = 22 ✓", "left", "md", "green"),
        N("Try this one on your own: 4x minus 5 equals 19."),
        divider("left"),
        ask("4x − 5 = 19"),
      ],
      { phase: "practice", verdict: "correct", step: 3, practice: "Solve 4x − 5 = 19", question: "Solve 4x − 5 = 19 and tell me x." },
    ),
  ],

  // 2. Accounting ---------------------------------------------------------------------
  accounting: [
    turn(
      [
        N("Hi! Let's lay out what we know. On October 1 they paid 12,000 dollars for 12 months of insurance."),
        box("given", "Given", ["Paid $12,000 on Oct 1", "Covers 12 months", "Year ends Dec 31"], "left"),
        N("Here's the timeline, so we can see how much of the policy is used up by December 31."),
        timeline("tl", "Insurance policy", ["Oct 1: paid $12,000", "Dec 31: adjust", "Sep 30: policy ends"]),
        N("Where are you stuck?"),
      ],
      { phase: "diagnose", question: "Where are you stuck?", choices: ["I don't know what to adjust", "I can't get the amount", "Which accounts do I use?"] },
    ),
    turn(
      [
        N("When they paid, the whole 12,000 went into Prepaid Insurance, an asset, because they hadn't used any coverage yet."),
        tacct("pre", "Prepaid Insurance", ["Oct 1: 12,000"], []),
        N("Each month uses up one twelfth of it. That's 12,000 divided by 12, which is 1,000 a month."),
        write("rate", "12,000 ÷ 12 = 1,000 per month", "left", "md", "blue"),
        N("Your turn: how many months have been used from October 1 to December 31?"),
        P("tl", "Dec 31", "count months"),
      ],
      { question: "Your turn: how many months of insurance were used by Dec 31? What's the expense?", plan: ["Find monthly cost", "Months used", "Journal entry"], step: 0 },
    ),
    turn(
      [
        N("Not quite. December 31 is the end of the third month: October, November, December."),
        P("tl", "Oct 1", "start"),
        P("tl", "Dec 31", "3 months later"),
        N("So it's 3 months, not 2. What's 3 times 1,000?"),
        P("rate", "1,000", "per month"),
      ],
      { phase: "check", verdict: "incorrect", question: "Your turn: 3 × 1,000 = ?", insight: "Counts months by subtracting; needs to count them" },
    ),
    turn(
      [
        N("Yes, 3,000 of insurance is used up. Used-up insurance becomes an expense, so we debit Insurance Expense."),
        tacct("exp", "Insurance Expense", ["Dec 31: 3,000"], []),
        N("And we credit Prepaid Insurance, because 3,000 of that asset is gone."),
        P("pre", "12,000", "was 12,000"),
        N("Here's the entry side by side with the T-accounts."),
        box("je", "Dec 31 entry", ["Dr Insurance Expense 3,000", "  Cr Prepaid Insurance 3,000"], "left", "green"),
      ],
      { phase: "check", verdict: "correct", step: 2, question: "Your turn: what's left in Prepaid Insurance after this entry?" },
    ),
    turn(
      [
        N("Sure, let's look at it as a picture instead. Think of the policy as a bar of 12 months."),
        canvas("bar", "right", "12-month policy"),
        sk("used", "bar", "rect", { x: 5, y: 35, x2: 30, y2: 60, text: "", color: "orange" }),
        sk("left", "bar", "rect", { x: 30, y: 35, x2: 95, y2: 60, text: "", color: "blue" }),
        N("The orange part is the three months used: that's the 3,000 expense. The blue part is still prepaid."),
        sk("lu", "bar", "text", { x: 17, y: 72, text: "3 used", r: 6, color: "orange" }),
        sk("ll", "bar", "text", { x: 62, y: 72, text: "9 left", r: 6, color: "blue" }),
        P("ll", "", "still an asset"),
      ],
      { question: "Your turn: what's the Prepaid Insurance balance now?", insight: "A picture helps when the numbers feel abstract" },
    ),
    turn(
      [
        N("Right, 9,000 is still prepaid. That's 9 months of coverage they haven't used yet."),
        write("bal", "Prepaid balance = 9,000", "left", "md", "green"),
        N("Try one: on March 1 a company pays 6,000 for 6 months of rent. What's the adjusting entry on April 30?"),
        divider("left"),
        ask("Rent: $6,000, 6 months"),
      ],
      { phase: "practice", verdict: "correct", practice: "On Mar 1 a company pays $6,000 for 6 months of rent. What adjusting entry is needed on Apr 30?", question: "Write the Apr 30 adjusting entry." },
    ),
  ],

  // 3a. Economics: equilibrium --------------------------------------------------------
  econ: [
    turn(
      [
        N("Hi! Here are the two lines. Demand slopes down: higher price, fewer buyers."),
        write("d", "Demand: P = 10 − 0.5Q", "left", "md", "blue"),
        write("s", "Supply: P = 2 + 0.5Q", "left", "md", "orange"),
        N("Let me put both on a graph so we can see where they meet."),
        graph("g1", "right", 0, 16, 0, 12, "Quantity", "Price", "Market"),
        plot("g1", "10-0.5x", "D", "blue"),
        plot("g1", "2+0.5x", "S", "orange"),
        N("Where do you want to start?"),
      ],
      { phase: "diagnose", question: "Where are you stuck?", choices: ["How do I find equilibrium?", "I can't solve it", "Check my answer"] },
    ),
    turn(
      [
        N("Equilibrium is where buyers and sellers agree on the same price, so we set the two P's equal."),
        P("g1", "8,6", "they meet"),
        write("eq", "10 − 0.5Q = 2 + 0.5Q", "left", "md"),
        N("Let's get the Q's on one side by adding 0.5Q to both sides."),
        balance("eq", "+ 0.5Q"),
        N("Your turn: what do you get after that?"),
      ],
      { question: "Your turn: add 0.5Q to both sides and simplify.", plan: ["Set D = S", "Solve Q", "Find P", "Show on graph"], step: 0 },
    ),
    turn(
      [
        N("Almost. The Q's combine to one whole Q, but the 2 is still stuck on the right."),
        P("eq", "2", "still here"),
        N("So it's 10 equals 2 plus Q. What's Q when you take 2 away?"),
        write("eq2", "10 = 2 + Q", "left", "md"),
      ],
      { phase: "check", verdict: "partial", question: "Your turn: solve 10 = 2 + Q." },
    ),
    turn(
      [
        N("Yes, Q is 8. Now plug 8 into either line to get the price: 10 minus half of 8 is 6."),
        write("q", "Q* = 8,  P* = 10 − 4 = 6", "left", "md", "green"),
        N("And here's that point on the graph: 8 units at a price of 6."),
        point("g1", 8, 6, "E (8, 6)"),
        N("Check it with supply: 2 plus half of 8 is also 6. Both lines agree."),
        P("s", "2 + 0.5Q", "gives 6 too"),
      ],
      { phase: "check", verdict: "correct", step: 3, question: "Your turn: at a price of 8, is there a shortage or a surplus?" },
    ),
    turn(
      [
        N("Right, a surplus. At 8, sellers want 12 units but buyers only want 4."),
        garrow("g1", 4, 8, 12, 8, "surplus"),
        N("Try one: demand P equals 12 minus Q, supply P equals Q. Find the equilibrium."),
        divider("left"),
        ask("P = 12 − Q, P = Q"),
      ],
      { phase: "practice", verdict: "correct", practice: "Demand P = 12 − Q, supply P = Q. Find equilibrium Q and P.", question: "Find Q* and P*." },
    ),
  ],

  // 3b. Economics: negative externality -----------------------------------------------
  externality: [
    turn(
      [
        N("Hi! The factory's pollution costs its neighbors 2 dollars for every unit, but the factory doesn't pay it."),
        box("given", "Given", ["External cost = $2 per unit", "Neighbors pay it, not the factory"], "left"),
        N("Let's draw the market. Demand and the factory's own supply cross at the market quantity."),
        graph("g1", "right", 0, 12, 0, 12, "Quantity", "Price", "Pollution"),
        plot("g1", "10-0.5x", "D", "blue"),
        plot("g1", "2+0.5x", "S (private)", "orange"),
        N("Where are you stuck?"),
      ],
      { phase: "diagnose", question: "Where are you stuck?", choices: ["What's a social cost?", "How do I draw it?", "Check my answer"] },
    ),
    turn(
      [
        N("The true cost to society is the factory's cost plus the 2 dollars of pollution, so we shift supply up by 2."),
        plot("g1", "4+0.5x", "S (social)", "red"),
        garrow("g1", 4, 4, 4, 6, "+$2"),
        N("The market stops where private supply meets demand, at 8 units."),
        point("g1", 8, 6, "Market"),
        N("Your turn: where does the social supply cross demand?"),
        P("g1", "6,7", "cross here?"),
      ],
      { question: "Your turn: where does the red social supply cross demand? What quantity?", plan: ["Private market", "Add the $2", "Compare quantities"], step: 1 },
    ),
    turn(
      [
        N("Good guess, but 10 is further right, and the social optimum has to be LESS than the market."),
        P("g1", "8,6", "market is 8"),
        N("Set 10 minus half Q equal to 4 plus half Q. What Q do you get?"),
        write("eq", "10 − 0.5Q = 4 + 0.5Q", "left", "md"),
      ],
      { phase: "check", verdict: "incorrect", question: "Your turn: solve 10 − 0.5Q = 4 + 0.5Q." },
    ),
    turn(
      [
        N("Yes, Q is 6. That's the social optimum."),
        point("g1", 6, 7, "Optimum"),
        N("The market makes 8, but society only wants 6. Those 2 extra units cost more than they're worth."),
        garrow("g1", 6, 2, 8, 2, "overproduce"),
        P("g1", "7,6.5", "too much"),
      ],
      { phase: "check", verdict: "correct", question: "Your turn: why does the market overproduce?", step: 2 },
    ),
    turn(
      [
        N("Exactly: the factory ignores the 2 dollars it pushes onto neighbors, so its costs look too low."),
        box("key", "Key idea", ["Negative externality → market Q too high", "Fix: a $2 per unit tax"], "left", "green", "note"),
        N("Try one: a bakery's smell gives neighbors a 1 dollar benefit per loaf. Too many loaves, or too few?"),
        divider("left"),
        ask("Positive externality?"),
      ],
      { phase: "practice", verdict: "correct", practice: "A bakery's smell gives neighbors a $1 benefit per loaf. Does the market make too many or too few loaves? Why?", question: "Too many or too few? Why?" },
    ),
  ],

  // 4. History ------------------------------------------------------------------------
  history: [
    turn(
      [
        N("Hi! In June 1914, Archduke Franz Ferdinand of Austria-Hungary was shot in Sarajevo by a Serbian nationalist."),
        timeline("tl", "Summer 1914", ["Jun 28: assassination", "Jul 28: Austria declares war", "Aug 1–4: war spreads"]),
        N("In just five weeks, one murder pulled in most of Europe. Where do you want to start?"),
      ],
      { phase: "diagnose", question: "Where are you stuck?", choices: ["What's the alliance system?", "Why so fast?", "Help me write my answer"] },
    ),
    turn(
      [
        N("Europe had two teams. Each country promised to defend its partners, so a fight with one meant a fight with all."),
        box("tri", "Triple Alliance", ["Germany", "Austria-Hungary", "(Italy)"], "left", "red"),
        box("ent", "Triple Entente", ["Russia", "France", "Britain"], "right", "blue"),
        N("Let's chain it. First link: Austria blames Serbia and declares war."),
        flow("ch", "The chain reaction"),
        add("ch", "Austria attacks Serbia"),
        N("Your turn: Serbia had a big protector. Who, and what did they do next?"),
        P("ent", "Russia", "Serbia's ally"),
      ],
      { question: "Your turn: who protected Serbia, and what did they do?", plan: ["Two alliances", "The chain", "Why it spread"], step: 0 },
    ),
    turn(
      [
        N("Yes, Russia mobilized to protect Serbia, because they were fellow Slavs and Russia wanted influence in the Balkans."),
        add("ch", "Russia mobilizes"),
        N("And because Germany was Austria's ally, Germany declared war on Russia, then on Russia's partner, France."),
        add("ch", "Germany → Russia, France"),
        P("tri", "Germany", "backs Austria"),
      ],
      { phase: "check", verdict: "correct", question: "Your turn: Britain joined next. What pulled them in?" },
    ),
    turn(
      [
        N("Good question! Germany's plan was to knock out France fast, before Russia was ready, and the quickest road to Paris ran through Belgium."),
        add("ch", "Germany invades Belgium"),
        N("Britain had promised to protect Belgium's neutrality back in 1839, so the invasion brought Britain in on August 4."),
        add("ch", "Britain declares war"),
        P("ch.4", "", "the trigger"),
      ],
      { question: "Your turn: in one sentence, how did the alliances turn a local war into a world war?", insight: "Asks why; wants motives, not just events" },
    ),
    turn(
      [
        N("That's a strong sentence: each promise pulled in one more country, like dominoes."),
        P("ch.1", "", "one domino"),
        P("ch.5", "", "…knocks all"),
        N("For your essay, try this: explain one more link on your own. Why did Germany back Austria so strongly?"),
        divider("full"),
        ask("Why back Austria?"),
      ],
      { phase: "practice", verdict: "correct", practice: "In 2–3 sentences, explain why Germany gave Austria-Hungary a 'blank cheque' in July 1914.", question: "Why did Germany back Austria so strongly?" },
    ),
  ],

  // 5. Clock for i^4 ------------------------------------------------------------------
  clock: [
    turn(
      [
        N("Let's draw the powers of i as a clock, like you asked. First the clock face."),
        canvas("clk", "left", "The i-clock"),
        sk("face", "clk", "circle", { x: 50, y: 50, r: 34 }),
        N("We start at the top: i to the zero is 1. Multiplying by i turns us a quarter clockwise, so i sits at 3 o'clock."),
        sk("p0", "clk", "text", { x: 50, y: 8, text: "1", color: "green" }),
        sk("p1", "clk", "text", { x: 92, y: 50, text: "i", color: "blue" }),
        N("One more quarter turn: i squared is minus 1 at 6 o'clock, and i cubed is minus i at 9."),
        sk("p2", "clk", "text", { x: 50, y: 93, text: "−1", color: "red" }),
        sk("p3", "clk", "text", { x: 8, y: 50, text: "−i", color: "purple" }),
        N("This arrow is the key: four quarter turns make one full lap, so i to the fourth lands right back on 1."),
        sk("", "clk", "arc", { x: 50, y: 50, r: 24, x2: 10, y2: 350, text: "×i = ¼ turn", color: "orange" }),
        P("p0", "", "i⁴ = 1"),
      ],
      { phase: "teach", question: "Your turn: where on the clock is i^5?", plan: ["Build the clock", "Laps of 4", "Big powers"], step: 0 },
    ),
    turn(
      [
        N("Yes! i to the fifth is one quarter turn past the top, so it's back at 3 o'clock: i."),
        P("p1", "", "i⁵ = i"),
        N("Every 4 steps is a full lap. So for any power, count the full laps and look at what's left over."),
        write("rule", "iⁿ: divide n by 4, use the remainder", "left", "md", "blue"),
        N("Your turn: what's i to the 142?"),
        write("q", "i^142 = i^(140 + 2)", "left", "lg"),
      ],
      { phase: "check", verdict: "correct", question: "Your turn: what is i^142?" },
    ),
    turn(
      [
        N("Close! 140 is 35 full laps, which brings us back to 1 at the top. Then 2 more quarter turns."),
        P("q", "140", "35 laps"),
        P("q", "2", "2 more"),
        N("Two quarter turns from the top goes to i, then down to minus 1. So it's minus 1, not i."),
        P("p2", "", "i¹⁴² = −1"),
      ],
      { phase: "check", verdict: "incorrect", question: "Your turn: what is i^143?", insight: "Loses count when stepping around the cycle" },
    ),
    turn(
      [
        N("Exactly, minus i. One more step past minus 1."),
        P("p3", "", "i¹⁴³ = −i"),
        N("Try one: what's i to the 50?"),
        divider("left"),
        ask("i⁵⁰ = ?"),
      ],
      { phase: "practice", verdict: "correct", practice: "Find i^50.", question: "What is i^50?" },
    ),
  ],
};

const out = new URL("../docs/eval/sim/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, turns] of Object.entries(sessions)) writeFileSync(new URL(`${name}.json`, out), JSON.stringify(turns, null, 1));
console.log("wrote", Object.keys(sessions).map((k) => `${k} (${sessions[k].length} turns)`).join(", "));
