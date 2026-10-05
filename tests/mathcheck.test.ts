import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAction, fixArithmetic } from "../lib/mathcheck";

test("a wrong sum on the board is corrected, keeping the number style", () => {
  assert.equal(fixArithmetic("8,000 + 8,700 = 23,500"), "8,000 + 8,700 = 16,700");
  assert.equal(fixArithmetic("$8,000 + $8,700 = $23,500"), "$8,000 + $8,700 = $16,700");
  assert.equal(fixArithmetic("Goods available = 8,000 + 8,700 = 23,500"), "Goods available = 8,000 + 8,700 = 16,700");
  assert.equal(fixArithmetic("22 − 7 = 14"), "22 − 7 = 15");
  assert.equal(fixArithmetic("15 ÷ 4 = 3.5"), "15 ÷ 4 = 3.75");
  assert.equal(fixArithmetic("3 × (2 + 4) = 20"), "3 × (2 + 4) = 18");
});

test("correct math, algebra, blanks and answers-to-find are left alone", () => {
  for (const t of ["8,000 + 8,700 = 16,700", "3x + 7 = 22", "x = 5", "2x + 5 = 17", "8,000 + 8,700 = ?", "8,000 + 8,700 = __", "1/3 = 0.33", "Net income: 15,500 − 12,850", "i² = −1", "50% of 80 = 40", "2^3 = 8"]) {
    assert.equal(fixArithmetic(t), t, t);
  }
});

test("checkAction fixes text and list items of any board action", () => {
  const a = checkAction({ type: "note", text: "COGS", items: ["8,000 + 8,700 = 23,500", "16,700 − 3,600 = 13,100"] });
  assert.deepEqual(a.items, ["8,000 + 8,700 = 16,700", "16,700 − 3,600 = 13,100"]);
  const same = { type: "write" as const, text: "2x + 5 = 17" };
  assert.equal(checkAction(same), same);
});
