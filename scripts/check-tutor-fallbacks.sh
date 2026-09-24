#!/usr/bin/env bash
# Checks /api/tutor recovers when the structured-output call fails, using scripts/mock-anthropic.mjs.
# Usage: bash scripts/check-tutor-fallbacks.sh   (after `npm run build`)
set -u
cd "$(dirname "$0")/.."
BODY='{"problem":{"id":"p","title":"t","text":"Solve for x: 3x + 7 = 22","subject":"Algebra"},"preferences":{},"history":[],"boardSummary":"","studentMessage":""}'
PORT_APP=3107
PORT_MOCK=4107
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:$PORT_MOCK npx next start -p $PORT_APP >/tmp/check-app.log 2>&1 &
APP=$!
sleep 4
fail=0
for mode in normal MOCK_REJECT_SCHEMA MOCK_EMPTY_ONCE; do
  if [ "$mode" = normal ]; then env MOCK_TURNS=docs/eval/sim/algebra.json node scripts/mock-anthropic.mjs $PORT_MOCK >/dev/null 2>&1 &
  else env "$mode=1" MOCK_TURNS=docs/eval/sim/algebra.json node scripts/mock-anthropic.mjs $PORT_MOCK >/dev/null 2>&1 & fi
  MOCK=$!
  sleep 1
  out=$(curl -s -X POST localhost:$PORT_APP/api/tutor -H 'content-type: application/json' -d "$BODY")
  kill $MOCK; wait $MOCK 2>/dev/null
  if node -e 'const t=process.argv[1]; const a=t.indexOf("{"), b=t.lastIndexOf("}"); const j=JSON.parse(t.slice(a,b+1)); if(!j.board.some(x=>x.type==="narrate")) process.exit(1)' "$out" 2>/dev/null; then
    echo "ok   $mode"
  else
    echo "FAIL $mode: ${out:0:200}"; fail=1
  fi
done
kill $APP
grep -o '"mode":"[a-z]*"[^}]*"stop":"[a-z_]*"' /tmp/check-app.log | sed 's/^/     /'
exit $fail
