// Built-in demo assignments with fully scripted, offline lessons.
// These run with zero network access so a live demo can never die on stage.

import type { Assignment, BoardAction, TutorTurn } from "./types";

export interface DemoTurn extends Partial<TutorTurn> {
  say: string;
  /** Accepted answers to this turn's question. Omit to advance on any reply. */
  expect?: string[];
  /** Nudge shown after a wrong answer (turn repeats its question). */
  hint?: string;
  hintBoard?: BoardAction[];
  /** Prefix for the next turn's speech after a right / wrong answer. */
  rightPrefix?: string;
  wrongPrefix?: string;
}

export interface DemoLesson {
  problemId: string;
  script: DemoTurn[]; // opening → teach... → practice → wrapup (last)
  interrupts: { why: DemoTurn; differently: DemoTurn; slower: DemoTurn };
}

export interface DemoAssignment extends Assignment {
  demoId: string;
  blurb: string;
  emoji: string;
  lesson: DemoLesson;
}

const t = (d: DemoTurn): DemoTurn => d;

// ---------------------------------------------------------------- Algebra
const algebra: DemoAssignment = {
  demoId: "algebra",
  name: "Algebra I · Unit 3 Linear Equations Worksheet",
  blurb: "Two-step equations, distribution, a word problem, graphing",
  emoji: "𝑥",
  problems: [
    { id: "p1", title: "1. Solve for x: 3x + 7 = 22", text: "1. Solve for x: 3x + 7 = 22", subject: "Algebra" },
    { id: "p2", title: "2. Solve: 5(x − 2) = 3x + 4", text: "2. Solve for x: 5(x − 2) = 3x + 4", subject: "Algebra" },
    {
      id: "p3",
      title: "3. Phone plan word problem",
      text: "3. A phone plan costs $25 per month plus $0.10 per text message. Last month's bill was $41.50. How many text messages were sent?",
      subject: "Algebra",
    },
    { id: "p4", title: "4. Graph y = 2x − 3", text: "4. Graph y = 2x − 3. Identify the slope and the y-intercept.", subject: "Algebra" },
  ],
  lesson: {
    problemId: "p1",
    script: [
      t({
        phase: "diagnose",
        say: "",
        board: [
          { type: "narrate", text: "Hi, I'm Teacher! I'll write your equation big, so we can mark it up together." },
          { type: "write", id: "eq1", text: "3x + 7 = 22", size: "lg" },
          { type: "narrate", text: "Our goal is to get x all by itself, so I'm underlining the x." },
          { type: "underline", target: "eq1", match: "x", color: "blue", text: "goal: x alone" },
          { type: "narrate", text: "Quick question so I know where to start: what would you undo first?" },
        ],
        question: "To get x by itself, what would you undo FIRST?",
        choices: ["Divide by 3 first", "Subtract 7 first", "I'm not sure"],
        expect: ["subtract 7", "minus 7", "−7", "-7"],
        rightPrefix: "Nice instinct! ",
        wrongPrefix: "Totally normal, that's exactly what we'll sort out. ",
      }),
      t({
        phase: "teach",
        gap: "Inverse operations in reverse order (undo +7 before ÷3)",
        plan: ["Spot the layers", "Undo the + 7", "Undo the × 3", "Check it"],
        step: 0,
        say: "",
        board: [
          { type: "narrate", text: "Think of 3x plus 7 as a gift wrapped twice. First x got multiplied by 3, so I circle the 3x in blue." },
          { type: "circle", target: "eq1", match: "3x", color: "blue", text: "1st: x × 3" },
          { type: "narrate", text: "Then 7 was added on the outside. That's the outer layer, so it gets a red circle." },
          { type: "circle", target: "eq1", match: "+ 7", color: "red", text: "2nd: + 7" },
          { type: "narrate", text: "You unwrap from the outside in, so the last layer comes off first. I'll put that rule on a sticky note." },
          { type: "note", id: "rule", zone: "right", text: "Unwrap in reverse", items: ["Wrapped: × 3, then + 7", "Unwrap: − 7, then ÷ 3"] },
        ],
        question: "So what should we do to BOTH sides first?",
        choices: ["Add 7", "Subtract 7", "Divide by 3"],
        expect: ["subtract 7", "minus 7", "−7", "-7", "subtract"],
        hint: "Close! Look at the red circle: 7 was added last. What undoes adding 7?",
        hintBoard: [{ type: "highlight", target: "eq1", match: "+ 7" }],
        rightPrefix: "Yes! ",
        wrongPrefix: "Let's do it together: we subtract 7. ",
      }),
      t({
        phase: "teach",
        step: 1,
        say: "",
        board: [
          { type: "narrate", text: "I write minus 7 under BOTH sides, because an equation is a balance: whatever you do to one side, you do to the other." },
          { type: "balance", target: "eq1", text: "− 7" },
          { type: "narrate", text: "On the left, plus 7 minus 7 cancels, so only 3x is left. The right side still needs 22 minus 7." },
          { type: "write", id: "eq2", text: "3x = __", size: "lg" },
          { type: "arrow", from: "eq1", to: "eq2", text: "− 7 both sides" },
        ],
        question: "What's 22 − 7? That's what goes in the blank.",
        choices: ["14", "15", "29"],
        expect: ["15"],
        hint: "Count down from 22 by 7: 21, 20, 19, 18, 17, 16...",
        rightPrefix: "Exactly. ",
        wrongPrefix: "It's 15. ",
      }),
      t({
        phase: "teach",
        step: 2,
        say: "",
        board: [
          { type: "narrate", text: "I cross out the blank and write the new line: 3x equals 15." },
          { type: "strike", target: "eq2", match: "__" },
          { type: "write", id: "eq3", text: "3x = 15", size: "lg", color: "blue" },
          { type: "narrate", text: "Only one layer is left now: x is being multiplied by 3. I circle it, because that's what we undo next." },
          { type: "circle", target: "eq3", match: "3x", color: "blue", text: "x × 3" },
        ],
        question: "What do we do to both sides now?",
        choices: ["Subtract 3", "Divide by 3", "Multiply by 3"],
        expect: ["divide", "÷", "/3", "/ 3"],
        hint: "Multiplying by 3 is undone by... the opposite operation.",
        rightPrefix: "That's it. ",
        wrongPrefix: "We divide, because division undoes multiplication. ",
      }),
      t({
        phase: "check",
        step: 2,
        say: "",
        board: [
          { type: "narrate", text: "Divide both sides by 3, because dividing undoes the times 3. I write it under both sides again." },
          { type: "balance", target: "eq3", text: "÷ 3" },
          { type: "narrate", text: "The 3s on the left cancel, leaving x alone. You finish the right side." },
          { type: "write", id: "eq4", text: "x = ?", size: "lg" },
          { type: "askQuestion", text: "15 ÷ 3 = ?" },
        ],
        question: "So what is x?",
        choices: [],
        expect: ["5"],
        hint: "15 split into 3 equal groups: how many in each group?",
        rightPrefix: "Yes! x = 5. ",
        wrongPrefix: "It's 5, since 15 ÷ 3 = 5. ",
      }),
      t({
        phase: "check",
        step: 3,
        say: "",
        board: [
          { type: "narrate", text: "Let's prove it. I plug 5 back into the very first equation." },
          { type: "divider" },
          { type: "write", id: "chk", text: "Check: 3(5) + 7 = 15 + 7 = 22 ✓", color: "green" },
          { type: "narrate", text: "It comes out to 22, exactly the right side, so the answer works. That check is your safety net on every test." },
          { type: "underline", target: "chk", match: "22 ✓", color: "green" },
        ],
        question: "Ready to try a new one on your own?",
        choices: ["Yes, let's go"],
      }),
      t({
        phase: "practice",
        say: "",
        board: [
          { type: "narrate", text: "Fresh board, fresh problem. Same idea, different numbers." },
          { type: "clear" },
          { type: "write", id: "pr", text: "4x − 9 = 23", size: "lg" },
          { type: "narrate", text: "Here's your rule on a sticky note: undo the last thing first, and do it to both sides." },
          { type: "note", zone: "right", text: "Remember", items: ["Undo the LAST thing first", "Same move on both sides"] },
        ],
        practice: "Solve for x: 4x − 9 = 23",
        question: "Solve for x. What do you get?",
        choices: [],
        expect: ["8"],
        hint: "Not quite. 9 was subtracted last, so first ADD 9 to both sides. What's 23 + 9? Then divide by 4.",
        hintBoard: [
          { type: "balance", target: "pr", text: "+ 9" },
          { type: "write", text: "4x = ?", size: "lg" },
        ],
        rightPrefix: "Nailed it, x = 8! ",
        wrongPrefix: "The answer was x = 8. Add 9 to get 4x = 32, then divide by 4. ",
      }),
      t({
        phase: "wrapup",
        gap: "Inverse operations in reverse order (undo +7 before ÷3)",
        say: "",
        board: [
          { type: "narrate", text: "You solved that one completely on your own. Here's what to remember." },
          { type: "note", zone: "full", text: "Today's rule", items: ["Undo operations in REVERSE order", "Whatever you do to one side, do to the other", "Check by plugging your answer back in"] },
        ],
        question: "",
        choices: [],
        videos: [{ title: "Solving two-step equations", query: "solving two step equations inverse operations" }],
      }),
    ],
    interrupts: {
      why: t({
        say: "",
        board: [
          { type: "narrate", text: "Great question. We undo the plus 7 first because it was the last thing done to x. It's like socks and shoes: on goes socks, then shoes, but off comes shoes first." },
          { type: "note", zone: "right", text: "Socks & shoes", items: ["On: socks → shoes", "Off: shoes → socks", "x: ×3 → +7, so undo −7 → ÷3"] },
        ],
      }),
      differently: t({
        say: "",
        board: [
          { type: "narrate", text: "Let's picture marbles. Three bags each hold x marbles, plus 7 loose ones, 22 in total." },
          { type: "box", id: "bags", zone: "left", text: "Marble picture", items: ["[x] [x] [x]  +  7 loose  =  22", "remove the 7 loose marbles…", "[x] [x] [x]  =  22 − 7"] },
          { type: "narrate", text: "Take away the 7 loose ones, circled here, and only the bags are left." },
          { type: "circle", target: "bags.1", match: "7 loose", color: "red" },
        ],
      }),
      slower: t({
        say: "",
        board: [
          { type: "narrate", text: "No rush at all. Let's zoom in on one piece: the plus 7 stuck to the 3x. I'll highlight it." },
          { type: "highlight", target: "eq1", match: "+ 7" },
          { type: "narrate", text: "Our only job right now is to get rid of that plus 7." },
          { type: "write", text: "Step 1 only: get rid of the + 7", size: "sm", color: "purple" },
        ],
      }),
    },
  },
};

// ---------------------------------------------------------------- Intervals
const intervals: DemoAssignment = {
  demoId: "intervals",
  name: "MATH 110 · Intervals & Set Notation",
  blurb: "Number lines, ∩ and ∪, open vs closed endpoints",
  emoji: "∩",
  problems: [
    {
      id: "p1",
      title: "1. Find I ∩ J and I ∪ J",
      text: "1. Let I = (0, 3] and J = (−3, 2). Find I ∩ J and I ∪ J, and show both on a number line.",
      subject: "Algebra",
    },
    { id: "p2", title: "2. Inequality to interval notation", text: "2. Write −2 ≤ x < 5 in interval notation.", subject: "Algebra" },
    { id: "p3", title: "3. Intersect two rays", text: "3. Find A ∩ B where A = (−∞, 4] and B = (1, ∞).", subject: "Algebra" },
  ],
  lesson: {
    problemId: "p1",
    script: [
      t({
        phase: "diagnose",
        say: "",
        board: [
          { type: "narrate", text: "Hey! I'll write your two sets up top, so we can keep looking back at them." },
          { type: "write", id: "i", text: "I = (0, 3]", size: "lg", color: "blue" },
          { type: "write", id: "j", text: "J = (−3, 2)", size: "lg", color: "orange" },
          { type: "narrate", text: "Where does this one get confusing for you?" },
        ],
        question: "Where are you stuck?",
        choices: ["I don't know what ∩ and ∪ mean", "I mix up ( and ]", "Can you check my answer?"],
      }),
      t({
        phase: "teach",
        gap: "∩ = the overlap, ∪ = everything; each endpoint follows its own bracket",
        plan: ["Draw I and J", "∩ = the overlap", "∪ = everything"],
        step: 0,
        say: "",
        board: [
          { type: "narrate", text: "Let's draw a number line from −4 to 4, so both sets fit on it." },
          { type: "numberLine", id: "nl", zone: "full", xMin: -4, xMax: 4, text: "", items: [] },
          { type: "narrate", text: "I runs from 0 to 3, so I draw a blue bar between them." },
          { type: "interval", target: "nl", text: "I: (0, 3]", color: "blue" },
          { type: "narrate", text: "The round bracket means 0 is NOT in I, so that circle stays hollow. The square bracket means 3 IS in, so I fill it in." },
          { type: "arrow", from: "i:(", to: "nl.1.lo", color: "blue" },
          { type: "arrow", from: "i:]", to: "nl.1.hi", color: "blue" },
          { type: "narrate", text: "J goes from −3 to 2, with round brackets on both ends: orange bar, two hollow circles." },
          { type: "interval", target: "nl", text: "J: (−3, 2)", color: "orange" },
          { type: "narrate", text: "Now you read the picture: where do the blue and orange bars overlap?" },
        ],
        question: "Your turn: the bars overlap from ___ to ___?",
        choices: [],
        expect: ["0to2", "0and2", "(0,2)", "0-2", "0through2"],
        hint: "Look straight down from each bar. Blue starts at 0 and orange stops at 2. So the part in both runs from… to…?",
        hintBoard: [
          { type: "circle", target: "nl.1.lo", color: "red" },
          { type: "circle", target: "nl.2.hi", color: "red" },
        ],
        rightPrefix: "Exactly, 0 to 2. ",
        wrongPrefix: "It's from 0 to 2. ",
      }),
      t({
        phase: "teach",
        step: 1,
        say: "",
        board: [
          { type: "narrate", text: "That overlap is I ∩ J, because ∩ means in BOTH sets. I'll draw it as a green row." },
          { type: "interval", target: "nl", text: "I ∩ J: (0, 2)", color: "green" },
          { type: "narrate", text: "Both ends stay open: 0 is missing from I, and 2 is missing from J. To be in the intersection, a number has to be in both." },
          { type: "circle", target: "nl.3.lo", color: "red", text: "not in I" },
          { type: "circle", target: "nl.3.hi", color: "red", text: "not in J" },
          { type: "narrate", text: "So I ∩ J is (0, 2). Now you do the union. ∪ means in EITHER set. What's I ∪ J?" },
          { type: "write", id: "ans1", text: "I ∩ J = (0, 2)", size: "lg", color: "green" },
        ],
        question: "Your turn: what is I ∪ J? (watch the brackets on each end)",
        choices: [],
        expect: ["(-3,3]"],
        hint: "Go from the far left of ANY bar to the far right of ANY bar. Is −3 in either set? Is 3?",
        hintBoard: [
          { type: "circle", target: "nl.2.lo", color: "red" },
          { type: "circle", target: "nl.1.hi", color: "red" },
        ],
        rightPrefix: "Yes! ",
        wrongPrefix: "It's (−3, 3]. ",
      }),
      t({
        phase: "check",
        step: 2,
        say: "",
        board: [
          { type: "narrate", text: "It starts open at −3, because −3 isn't in I or J. It ends closed at 3, because 3 is in I." },
          { type: "write", id: "ans2", text: "I ∪ J = (−3, 3]  ✓", size: "lg", color: "green" },
          { type: "narrate", text: "That's the whole problem, done by you. Ready to try a fresh one alone?" },
          { type: "underline", target: "ans2", match: "(−3, 3]", color: "green" },
        ],
        question: "Ready for one on your own?",
        choices: ["Yes, let's go"],
      }),
      t({
        phase: "practice",
        say: "",
        board: [
          { type: "narrate", text: "New sets on a clean board. Same moves: picture them, find the overlap, then everything." },
          { type: "clear" },
          { type: "write", id: "a", text: "A = [1, 5)", size: "lg", color: "blue" },
          { type: "write", id: "b", text: "B = (3, 8]", size: "lg", color: "orange" },
          { type: "narrate", text: "Remember: ∩ is where they overlap, and each end follows its own bracket." },
          { type: "note", zone: "right", text: "Remember", items: ["∩ = in BOTH (overlap)", "∪ = in EITHER (everything)", "Check each end's bracket"] },
        ],
        practice: "A = [1, 5), B = (3, 8]. Find A ∩ B (and A ∪ B if you want a bonus).",
        question: "What is A ∩ B?",
        choices: [],
        expect: ["(3,5)"],
        hint: "Picture it: A stops just before 5, B starts just after 3. The overlap is between 3 and 5. Are those ends open or closed?",
        hintBoard: [{ type: "numberLine", id: "nl2", zone: "full", xMin: 0, xMax: 9, text: "", items: ["A: [1, 5)", "B: (3, 8]"] }],
        rightPrefix: "Perfect, (3, 5)! ",
        wrongPrefix: "It's (3, 5): both ends open, because 5 isn't in A and 3 isn't in B. ",
      }),
      t({
        phase: "wrapup",
        gap: "∩ = the overlap, ∪ = everything; each endpoint follows its own bracket",
        say: "",
        board: [
          { type: "narrate", text: "Draw the number line first and these almost solve themselves. Here's the whole idea on one note." },
          { type: "note", zone: "full", text: "Today's rule", items: ["∩ means the overlap (in BOTH)", "∪ means everything (in EITHER)", "Each endpoint follows its own bracket: ( open, ] closed"] },
        ],
        question: "",
        choices: [],
        videos: [{ title: "Intersection and union of intervals", query: "intersection and union of intervals number line" }],
      }),
    ],
    interrupts: {
      why: t({
        say: "",
        board: [
          { type: "narrate", text: "Good question! We draw it because the picture shows the overlap instantly, instead of juggling brackets in your head." },
          { type: "note", zone: "right", text: "Why draw it?", items: ["Overlap = where bars stack", "Hollow ○ = not included", "Filled ● = included"] },
        ],
      }),
      differently: t({
        say: "",
        board: [
          { type: "narrate", text: "Think of two friends' free time. I is free from 0 to 3, J from −3 to 2. A meeting only works when BOTH are free: that's ∩." },
          { type: "box", zone: "left", text: "Free-time version", items: ["I free: 0 → 3 (can stay until 3)", "J free: −3 → 2 (must leave before 2)", "Both free (∩): 0 → 2", "Either free (∪): −3 → 3"] },
        ],
      }),
      slower: t({
        say: "",
        board: [
          { type: "narrate", text: "Let's slow down and look at just one thing: the blue bar. It covers everything from 0 up to 3." },
          { type: "highlight", target: "i" },
        ],
      }),
    },
  },
};

// ---------------------------------------------------------------- Accounting
const accounting: DemoAssignment = {
  demoId: "accounting",
  name: "ACCT 201 · Adjusting Entries Study Guide",
  blurb: "Prepaid expenses, accrued salaries, depreciation",
  emoji: "$",
  problems: [
    {
      id: "p1",
      title: "1. Prepaid insurance adjusting entry",
      text: "1. On October 1, Rivera Co. paid $12,000 cash for a 12-month insurance policy and debited Prepaid Insurance. Prepare the adjusting entry needed on December 31, the end of the accounting year.",
      subject: "Accounting",
    },
    {
      id: "p2",
      title: "2. Accrued salaries",
      text: "2. As of December 31, employees have earned $3,500 of salaries that will not be paid until January 5. Record the adjusting entry on December 31.",
      subject: "Accounting",
    },
    {
      id: "p3",
      title: "3. Straight-line depreciation",
      text: "3. Equipment costing $24,000 has a 6-year useful life and no salvage value. Record one year of straight-line depreciation.",
      subject: "Accounting",
    },
  ],
  lesson: {
    problemId: "p1",
    script: [
      t({
        phase: "diagnose",
        say: "Hi, I'm Teacher! Let's lay out what happened on a timeline first. Then one quick question.",
        board: [
          { type: "timeline", id: "tl", text: "Insurance policy", items: ["Oct 1: Pay $12,000", "Dec 31: Year-end", "Sep 30: Policy ends"] },
        ],
        question: "When Rivera paid $12,000 on Oct 1, what did they get?",
        choices: ["An expense right away", "An asset (Prepaid Insurance)", "Not sure"],
        expect: ["asset", "prepaid"],
        rightPrefix: "Yes, an asset! ",
        wrongPrefix: "That's the most common mix-up, so it's the perfect place to start. ",
      }),
      t({
        phase: "teach",
        gap: "Prepaid expenses are assets that turn into expense as they're used up",
        plan: ["Prepaid = asset", "How much is used?", "Move the used part", "The entry"],
        step: 0,
        say: "Paying ahead is like buying a 12-month gym pass. On day one you haven't used any of it yet. It's something you own, an asset called Prepaid Insurance.",
        board: [
          { type: "tAccount", id: "pi", text: "Prepaid Insurance", debits: ["Oct 1  12,000"], credits: [] },
          { type: "tAccount", id: "cash", text: "Cash", debits: [], credits: ["Oct 1  12,000"] },
          { type: "note", zone: "full", text: "Paid ahead = asset until it's used" },
        ],
        question: "By Dec 31, how many months of coverage have been used up?",
        choices: ["3 months", "9 months", "12 months"],
        expect: ["3"],
        hint: "Count on the timeline: October, November, December...",
        hintBoard: [{ type: "highlight", target: "tl.1" }, { type: "highlight", target: "tl.2" }],
        rightPrefix: "Right: October, November, December. ",
        wrongPrefix: "It's 3: October, November and December. ",
      }),
      t({
        phase: "teach",
        step: 1,
        say: "Each month of coverage costs 12,000 divided by 12.",
        board: [
          { type: "write", id: "m", text: "$12,000 ÷ 12 months = $1,000 / month", zone: "full" },
          { type: "circle", target: "m", match: "$1,000", color: "blue" },
        ],
        question: "So how much insurance was used up in those 3 months?",
        choices: ["$1,000", "$3,000", "$9,000"],
        expect: ["3000", "3,000"],
        hint: "3 months × $1,000 per month = ?",
        rightPrefix: "Exactly, $3,000 used. ",
        wrongPrefix: "It's $3,000: three months at $1,000 each. ",
      }),
      t({
        phase: "teach",
        step: 2,
        say: "The adjusting entry moves the used part out of the asset and into an expense. What's used becomes expense; what's left stays an asset.",
        board: [
          { type: "tAccount", id: "ie", text: "Insurance Expense", debits: ["Dec 31  ?"], credits: [] },
          { type: "arrow", from: "pi", to: "ie", text: "move the used $3,000" },
        ],
        question: "In the entry, which account gets the DEBIT?",
        choices: ["Cash", "Insurance Expense", "Prepaid Insurance"],
        expect: ["insurance expense", "expense"],
        hint: "Expenses go up with a debit. Which account is growing here?",
        rightPrefix: "Yes! ",
        wrongPrefix: "The expense gets the debit, because expenses increase with debits. ",
      }),
      t({
        phase: "check",
        step: 3,
        say: "Debit Insurance Expense, credit Prepaid Insurance, $3,000 each. Notice cash doesn't move at all. Cash already left back in October.",
        board: [
          { type: "clear" },
          { type: "table", id: "je", zone: "full", headers: ["Date", "Account", "Debit", "Credit"], rows: [["Dec 31", "Insurance Expense", "3,000", ""], ["", "   Prepaid Insurance", "", "3,000"]] },
          { type: "highlight", target: "je", match: "Insurance Expense" },
          { type: "askQuestion", text: "What's left in Prepaid Insurance?" },
        ],
        question: "After this entry, what's left in Prepaid Insurance?",
        choices: ["$3,000", "$9,000", "$12,000"],
        expect: ["9000", "9,000"],
        hint: "Start with $12,000 and take away what was used.",
        rightPrefix: "Right, $9,000 of coverage is still unused. ",
        wrongPrefix: "It's $9,000: 12,000 minus the 3,000 used. ",
      }),
      t({
        phase: "practice",
        say: "Your turn with a fresh one. Same idea: find the monthly cost, count the months used.",
        board: [
          { type: "clear" },
          { type: "box", id: "rent", zone: "left", text: "New problem", items: ["Sep 1: Lopez Co. pays $4,800", "for 12 months of rent in advance", "Year-end: Dec 31"] },
          { type: "note", zone: "right", text: "Recipe", items: ["cost ÷ months = per month", "× months used", "Dr Expense, Cr Prepaid"] },
        ],
        practice: "On Sept 1, Lopez Co. paid $4,800 for 12 months of rent in advance. How much Rent Expense should the Dec 31 adjusting entry record?",
        question: "How much Rent Expense on Dec 31?",
        choices: [],
        expect: ["1600", "1,600"],
        hint: "Not yet. Months used: Sept, Oct, Nov, Dec = 4. Per month: 4,800 ÷ 12. Multiply those.",
        rightPrefix: "Perfect, $1,600! ",
        wrongPrefix: "It's $1,600: $400 a month × 4 months. ",
      }),
      t({
        phase: "wrapup",
        gap: "Prepaid expenses are assets that turn into expense as they're used up",
        say: "You've got it. Prepaid means asset first. At year-end you move only the used part into expense. That same pattern covers prepaid rent, supplies and subscriptions.",
        board: [
          { type: "note", zone: "full", text: "Today's rule", items: ["Pay ahead → asset (Prepaid)", "Adjust: used part → Dr Expense, Cr Prepaid", "Cash doesn't move in an adjusting entry"] },
        ],
        question: "",
        choices: [],
        videos: [{ title: "Prepaid expense adjusting entries", query: "prepaid insurance adjusting entry explained" }],
      }),
    ],
    interrupts: {
      why: t({
        say: "Good question! We don't expense it all in October because expenses should show up in the months they actually help the business. That's called the matching principle.",
        board: [{ type: "note", zone: "full", text: "Matching principle", items: ["Record the expense in the month it's USED", "not the month it's PAID"] }],
      }),
      differently: t({
        say: "Here's another way to see it. Picture 12 monthly coupons. Each month-end you tear one off, and it becomes expense.",
        board: [
          { type: "table", id: "months", zone: "full", headers: ["Month", "Coupon used?", "Expense"], rows: [["Oct", "✓ torn off", "$1,000"], ["Nov", "✓ torn off", "$1,000"], ["Dec", "✓ torn off", "$1,000"], ["Jan–Sep", "still in the book", "not yet"]] },
        ],
      }),
      slower: t({
        say: "Let's slow down. Forget debits for a second. The only question right now is: how much of the policy did they use by December 31?",
        board: [{ type: "write", text: "Just this: how much was USED by Dec 31?", zone: "full", color: "purple" }],
      }),
    },
  },
};

// ---------------------------------------------------------------- Chemistry
const chemistry: DemoAssignment = {
  demoId: "chemistry",
  name: "CHEM 101 · Stoichiometry Practice",
  blurb: "Grams → moles → grams, balancing, molar mass",
  emoji: "⚗",
  problems: [
    {
      id: "p1",
      title: "1. Grams of water from 4.0 g H₂",
      text: "1. How many grams of water are produced when 4.0 g of hydrogen gas reacts completely with excess oxygen?  2H₂ + O₂ → 2H₂O",
      subject: "Chemistry",
    },
    { id: "p2", title: "2. Balance Fe + O₂ → Fe₂O₃", text: "2. Balance the equation: Fe + O₂ → Fe₂O₃", subject: "Chemistry" },
    { id: "p3", title: "3. Molar mass of CaCO₃", text: "3. Calculate the molar mass of calcium carbonate, CaCO₃.", subject: "Chemistry" },
  ],
  lesson: {
    problemId: "p1",
    script: [
      t({
        phase: "diagnose",
        say: "Hi, I'm Teacher! Let's sort out what we know and what we need. Then one quick question.",
        board: [
          { type: "write", id: "rx", text: "2H₂ + O₂ → 2H₂O", size: "lg", zone: "full" },
          { type: "box", id: "given", zone: "left", text: "Given", items: ["4.0 g of H₂", "O₂ is in excess"] },
          { type: "box", id: "find", zone: "right", text: "Find", items: ["grams of H₂O"], color: "red" },
        ],
        question: "The equation says 2H₂ makes 2H₂O. Are those 2's grams, or something else?",
        choices: ["Grams", "Moles (particle counts)", "Not sure"],
        expect: ["mole", "particle", "count"],
        rightPrefix: "Exactly right, moles. ",
        wrongPrefix: "This is the key idea, so great place to start: they're moles, not grams. ",
      }),
      t({
        phase: "teach",
        gap: "You can't go grams → grams directly; convert through moles using the mole ratio",
        plan: ["Grams → moles", "Use the mole ratio", "Moles → grams"],
        step: 0,
        say: "The coefficients count particles, not weight. It's like a recipe: 2 eggs, not 2 grams of egg. So we convert grams to moles, use the recipe, then convert back.",
        board: [
          { type: "timeline", id: "road", text: "The road map", items: ["g H₂: start", "mol H₂: ÷ molar mass", "mol H₂O: mole ratio", "g H₂O: × molar mass"], color: "purple" },
        ],
        question: "H₂ has a molar mass of about 2.0 g/mol. How many moles is 4.0 g of H₂?",
        choices: ["0.5 mol", "2.0 mol", "8.0 mol"],
        expect: ["2"],
        hint: "Moles = grams ÷ molar mass. What's 4.0 ÷ 2.0?",
        rightPrefix: "Yes, 2.0 moles. ",
        wrongPrefix: "It's 4.0 ÷ 2.0 = 2.0 moles. ",
      }),
      t({
        phase: "teach",
        step: 1,
        say: "Now the recipe step. 2 H₂ makes 2 H₂O, so the ratio is one to one.",
        board: [
          { type: "write", id: "s1", text: "4.0 g H₂ × (1 mol ÷ 2.0 g) = 2.0 mol H₂", zone: "full" },
          { type: "write", id: "s2", text: "2.0 mol H₂ × (2 mol H₂O ÷ 2 mol H₂)", zone: "full" },
          { type: "highlight", target: "s2", match: "(2 mol H₂O ÷ 2 mol H₂)" },
          { type: "circle", target: "rx", match: "2H₂O", color: "blue", text: "from the recipe" },
        ],
        question: "How many moles of H₂O is that?",
        choices: ["1.0 mol", "2.0 mol", "4.0 mol"],
        expect: ["2"],
        hint: "The ratio 2 : 2 simplifies to 1 : 1. Moles in = moles out.",
        rightPrefix: "Right, 2.0 moles of water. ",
        wrongPrefix: "It's 2.0 moles, since the ratio is 1 : 1. ",
      }),
      t({
        phase: "check",
        step: 2,
        say: "Last stop: turn moles of water back into grams. Water's molar mass is 18: two hydrogens at 1 each, plus one oxygen at 16.",
        board: [
          { type: "write", id: "mm", text: "H₂O: 2(1.0) + 16.0 = 18.0 g/mol", zone: "full", color: "blue" },
          { type: "write", id: "s3", text: "2.0 mol H₂O × 18.0 g/mol = ?", zone: "full" },
          { type: "underline", target: "s3", match: "18.0 g/mol" },
        ],
        question: "How many grams of water are produced?",
        choices: [],
        expect: ["36"],
        hint: "Multiply 2.0 × 18.0.",
        rightPrefix: "36 grams, you got it! ",
        wrongPrefix: "It's 36 g: 2.0 × 18.0. ",
      }),
      t({
        phase: "practice",
        say: "Try this one on your own. Same road map: moles, ratio, grams.",
        board: [
          { type: "clear" },
          { type: "write", id: "prx", text: "CH₄ + 2O₂ → CO₂ + 2H₂O", size: "lg", zone: "full" },
          { type: "box", zone: "left", text: "Given", items: ["2.0 mol CH₄ burns", "CO₂ = 44 g/mol"] },
          { type: "box", zone: "right", text: "Find", items: ["grams of CO₂"], color: "red" },
        ],
        practice: "How many grams of CO₂ are produced when 2.0 mol of CH₄ burns completely? CH₄ + 2O₂ → CO₂ + 2H₂O (CO₂ = 44 g/mol)",
        question: "How many grams of CO₂?",
        choices: [],
        expect: ["88"],
        hint: "Look at the coefficients: 1 CH₄ makes 1 CO₂. So 2.0 mol CH₄ makes how many mol CO₂? Then × 44.",
        hintBoard: [{ type: "circle", target: "prx", match: "CO₂", color: "blue" }],
        rightPrefix: "88 grams, perfect! ",
        wrongPrefix: "It's 88 g: 2.0 mol CO₂ × 44 g/mol. ",
      }),
      t({
        phase: "wrapup",
        gap: "You can't go grams → grams directly; convert through moles using the mole ratio",
        say: "Great work. The big idea: equations count moles, not grams. Always go grams to moles, use the ratio, then back to grams.",
        board: [{ type: "note", zone: "full", text: "Today's rule", items: ["Coefficients = moles (counts), not grams", "g → mol → (ratio) → mol → g", "Molar mass is the bridge both ways"] }],
        question: "",
        choices: [],
        videos: [{ title: "Stoichiometry grams to grams", query: "stoichiometry grams to grams mole ratio tutorial" }],
      }),
    ],
    interrupts: {
      why: t({
        say: "Good question. We go through moles because the equation is a recipe in counts. Hydrogen atoms are super light and oxygen is heavy, so equal grams don't mean equal particles.",
        board: [{ type: "note", zone: "full", text: "Why moles?", items: ["1 H atom ≈ 1 g/mol, 1 O atom ≈ 16 g/mol", "Same grams ≠ same number of particles", "Recipes count particles"] }],
      }),
      differently: t({
        say: "Picture a sandwich shop. Two slices of bread plus one cheese makes one sandwich. You'd count slices, not weigh them. Moles are chemistry's way of counting.",
        board: [
          { type: "box", zone: "full", text: "Sandwich version", items: ["2 bread + 1 cheese → 1 sandwich", "Given: a bag of bread by WEIGHT", "Step 1: weight → count of slices (like g → mol)"] },
        ],
      }),
      slower: t({
        say: "Let's go one tiny step at a time. Right now we only care about one thing: turning 4.0 grams of hydrogen into moles.",
        board: [{ type: "write", text: "Just this step: 4.0 g H₂ → ? mol H₂", zone: "full", color: "purple" }],
      }),
    },
  },
};

// ---------------------------------------------------------------- Economics
const economics: DemoAssignment = {
  demoId: "economics",
  name: "ECON 1 · Supply & Demand Problem Set",
  blurb: "Equilibrium, shifts, price ceilings, elasticity",
  emoji: "↗",
  problems: [
    {
      id: "p1",
      title: "1. Find equilibrium, then shift demand",
      text: "1. In the market for coffee, demand is P = 10 − 0.5Q and supply is P = 2 + 0.5Q. (a) Find the equilibrium price and quantity. (b) What happens to equilibrium price and quantity if demand increases?",
      subject: "Economics",
    },
    { id: "p2", title: "2. Price ceilings and shortages", text: "2. What is a price ceiling, and why does a binding price ceiling cause a shortage? Use a graph.", subject: "Economics" },
    {
      id: "p3",
      title: "3. Midpoint elasticity",
      text: "3. When the price of a sandwich rises from $4 to $5, quantity demanded falls from 100 to 80. Calculate the price elasticity of demand using the midpoint method.",
      subject: "Economics",
    },
  ],
  lesson: {
    problemId: "p1",
    script: [
      t({
        phase: "diagnose",
        say: "Hi, I'm Teacher! Let me sketch the two curves so we can see the market. Then a quick question.",
        board: [
          { type: "write", id: "d", text: "Demand: P = 10 − 0.5Q", color: "blue" },
          { type: "write", id: "s", text: "Supply: P = 2 + 0.5Q", color: "red" },
          { type: "graph", id: "g1", zone: "right", xMin: 0, xMax: 20, yMin: 0, yMax: 12, xLabel: "Q", yLabel: "P", text: "Coffee market" },
          { type: "plot", target: "g1", fn: "10-0.5x", text: "D", color: "blue" },
          { type: "plot", target: "g1", fn: "2+0.5x", text: "S", color: "red" },
        ],
        question: "What does the point where the two lines cross mean?",
        choices: ["Buyers want exactly what sellers offer", "The price is highest there", "Not sure"],
        expect: ["buyers", "exactly", "equal", "same"],
        rightPrefix: "Exactly: that's equilibrium. ",
        wrongPrefix: "Good place to start. At the crossing, buyers want exactly what sellers offer. That's equilibrium. ",
      }),
      t({
        phase: "teach",
        gap: "Equilibrium = the point both equations share, so set them equal",
        plan: ["Where the curves meet", "Set equal, solve Q", "Plug in for P", "Shift demand"],
        step: 0,
        say: "At the crossing, both equations have the same P and the same Q. So we can set the two right-hand sides equal to each other.",
        board: [
          { type: "write", id: "eq", text: "10 − 0.5Q = 2 + 0.5Q" },
          { type: "arrow", from: "s", to: "eq", text: "same P" },
        ],
        question: "Get the Q's together: what do you get if you add 0.5Q to both sides?",
        choices: ["10 = 2", "10 = 2 + Q", "10 + Q = 2"],
        expect: ["10 = 2 + q", "10=2+q", "2 + q", "2+q"],
        hint: "−0.5Q + 0.5Q cancels on the left. On the right, 0.5Q + 0.5Q = ?",
        rightPrefix: "Yes! ",
        wrongPrefix: "It becomes 10 = 2 + Q. ",
      }),
      t({
        phase: "teach",
        step: 1,
        say: "Adding 0.5Q to both sides moves all the Q's to one side.",
        board: [
          { type: "balance", target: "eq", text: "+ 0.5Q" },
          { type: "write", id: "eq2", text: "10 = 2 + Q" },
        ],
        question: "So what is Q?",
        choices: [],
        expect: ["8"],
        hint: "Subtract 2 from both sides.",
        rightPrefix: "Q equals 8. ",
        wrongPrefix: "Q is 8, since 10 − 2 = 8. ",
      }),
      t({
        phase: "check",
        step: 2,
        say: "Now plug 8 into either equation to find the price. Let's use demand.",
        board: [
          { type: "write", id: "q", text: "Q* = 8", color: "green" },
          { type: "write", id: "p", text: "P = 10 − 0.5(8) = ?" },
          { type: "circle", target: "p", match: "0.5(8)", color: "blue", text: "= 4" },
        ],
        question: "What's the equilibrium price?",
        choices: [],
        expect: ["6"],
        hint: "10 − 4 = ?",
        rightPrefix: "$6, right! ",
        wrongPrefix: "It's $6: 10 − 4. ",
      }),
      t({
        phase: "teach",
        step: 3,
        say: "Here's our equilibrium dot. Now part b: if demand increases, the whole demand curve shifts to the right.",
        board: [
          { type: "point", target: "g1", x: 8, y: 6, text: "E (8, 6)" },
          { type: "plot", target: "g1", fn: "12-0.5x", text: "D₂", color: "purple" },
          { type: "graphArrow", target: "g1", x1: 7, y1: 8.4, x2: 10.5, y2: 8.4, text: "shift" },
        ],
        question: "When demand shifts right, what happens to equilibrium price and quantity?",
        choices: ["Both rise", "Both fall", "Price rises, quantity falls"],
        expect: ["both rise", "both increase", "both go up"],
        hint: "Follow the red supply line up to where it meets the new purple D₂.",
        rightPrefix: "Both rise, exactly. ",
        wrongPrefix: "Both rise: the new crossing is higher and further right. ",
      }),
      t({
        phase: "practice",
        say: "New market, your turn. Same move: set them equal, then solve.",
        board: [
          { type: "clear" },
          { type: "write", id: "nd", text: "Demand: P = 12 − Q", color: "blue" },
          { type: "write", id: "ns", text: "Supply: P = 2 + Q", color: "red" },
          { type: "note", zone: "right", text: "Recipe", items: ["Set the P's equal", "Solve for Q", "Plug in for P"] },
        ],
        practice: "Demand is P = 12 − Q and supply is P = 2 + Q. What is the equilibrium quantity?",
        question: "What's the equilibrium quantity Q?",
        choices: [],
        expect: ["5"],
        hint: "Set 12 − Q = 2 + Q. Add Q to both sides, then subtract 2, then divide by 2.",
        hintBoard: [{ type: "write", id: "neq", text: "12 − Q = 2 + Q" }],
        rightPrefix: "Q = 5, nice! ",
        wrongPrefix: "It's Q = 5: 12 = 2 + 2Q, so 2Q = 10. ",
      }),
      t({
        phase: "wrapup",
        gap: "Equilibrium = the point both equations share, so set them equal",
        say: "You did it. Equilibrium is just the point both equations share, so you set them equal. And when demand shifts right, price and quantity both rise.",
        board: [{ type: "note", zone: "full", text: "Today's rule", items: ["Equilibrium: set supply = demand", "Solve Q first, then plug in for P", "Demand ↑ → P ↑ and Q ↑"] }],
        question: "",
        choices: [],
        videos: [{ title: "Market equilibrium algebra", query: "solve market equilibrium supply and demand equations" }],
      }),
    ],
    interrupts: {
      why: t({
        say: "Good question! We set them equal because at equilibrium the buyers' price and the sellers' price are the same number. Two expressions for the same P must be equal.",
        board: [{ type: "note", zone: "left", text: "Why set equal?", items: ["Demand P = the price buyers pay", "Supply P = the price sellers accept", "At equilibrium they're the SAME P"] }],
      }),
      differently: t({
        say: "Let's try a table instead of algebra. We check a few quantities and look for where the buyers' price matches the sellers' price.",
        board: [
          { type: "table", id: "tbl", zone: "left", headers: ["Q", "Buyers' P", "Sellers' P"], rows: [["4", "8", "4"], ["6", "7", "5"], ["8", "?", "?"], ["10", "5", "7"]] },
          { type: "highlight", target: "tbl", match: "?" },
        ],
      }),
      slower: t({
        say: "Let's slow way down. Forget the graph for now. We have two equations, and both start with P equals. That's our only clue for this step.",
        board: [{ type: "circle", target: "d", match: "P =", color: "blue" }, { type: "circle", target: "s", match: "P =", color: "red" }],
      }),
    },
  },
};

export const DEMO_ASSIGNMENTS: DemoAssignment[] = [algebra, intervals, accounting, chemistry, economics];

export function getDemo(id: string | undefined): DemoAssignment | undefined {
  return DEMO_ASSIGNMENTS.find((d) => d.demoId === id);
}
