# BUILD DAY #1

**Friday, September 25 · Frost 181-0102**
**Doors at 12:00. We start at 12:10. Out by 1:50.**

**Submissions close Thursday, September 24 at 11:59 PM PDT.** That's four days.
Read this today, not Wednesday.

**Building with Claude Code or Codex?** Save this file as `README.md` in your project folder
and your agent will read it on its own. Or paste the whole thing into the chat. Either way
it has the prompt, the rules, the deadline and the deploy options, so it can work out what
you need and take you from there.

---

## The prompt

**Build something that solves a problem you actually have as a student.**

It should be a tool you'd keep using after Friday, one that makes your life easier. Pick
something from your own week: a class workflow, note-taking, studying, scheduling, group
projects, tracking assignments.

Ship something that works, then show us it working.

**The test is whether you'd open it again next Tuesday.** A plain thing you'd actually use
beats a polished thing you'd never touch again. You're the first user. If you wouldn't use
it, nobody will.

---

## How to pick your idea

**Pick the thing that actually annoyed you this week.** You already know what it is.

The thing you do by hand every week. The tab you keep forgetting to check. The annoying
part of a group project. The part of studying you keep avoiding. Don't go looking for a
good idea, go looking at your own week.

**Don't worry about whether it's original.** If four people build an assignment tracker,
they'll be four completely different assignment trackers, and you'll learn more comparing
them than you would have building something clever on your own. Nobody is scored on having
a novel idea.

Pick something you don't actually care about and you'll resent it by Wednesday. You're the
one staring at it for four days.

### Ideas

Take one, twist it, or ignore them all.

- The page that tells you what to actually work on next
- A syllabus turned into a calendar you'd really look at
- Lecture notes turned into something you'd actually review
- What you can skip this week without it mattering
- The study group scheduler that doesn't take six rounds of texting
- A tracker for the readings you keep saying you'll catch up on
- The thing that tells you what's actually due before Monday
- Whatever your group project is currently losing track of

---

## The rules

1. **Individual only.** One person owns one entry. No teams. Group work starts in October.
2. **Any stack.** AI tools expected, not merely allowed. This is a vibe coding club.
3. **It has to be deployed.** Submit a URL that works for someone else, on their own
   machine, with nothing installed and nothing running locally. **Local-only demos are not
   accepted.** If it dies when you close your terminal, it doesn't count. It does not have
   to look good on a phone.
4. **In the form by Thursday, 11:59 PM PDT.** The demo lineup gets built Friday morning
   from what's in the form. If you're not in it, you're not demoing.
5. **You have to be there Friday.** Attendance at the meeting is mandatory if you submit.
   Demos are live. If you're not in the room, you can't demo, you don't get scored, and you
   can't win. Don't submit if you can't make it.
6. **You get up to five minutes, then questions.** Up to. If you can show the thing in two,
   show it in two and sit down, nobody is scored on filling the clock. **When you finish,
   the judges will have follow-up questions about your build.** Things like what problem it
   solves, what the hardest part was, what you'd do next. Know your own thing well enough to
   answer without guessing.

**On rule 3, seriously.** This is the rule that will get people. Deploying is not the hard
part. It's the part everyone leaves until Thursday and then discovers is broken. Deploy
something empty on **Tuesday**, before you've built anything, and open it on your phone to
confirm. Your phone is the fastest proof you actually deployed, because it definitely isn't
running your dev server. Then build. That way Thursday night is just building, not
debugging a deploy.

Never deployed anything before? See the next section. Your agent can do the whole thing
with you.

---

## Getting your live URL

Rule 3 is the one that gets people, so here is how to clear it.

**The short version: ask your agent and it will deploy this with you.** Claude and Codex
can both take you from a folder on your laptop to a working public URL, one step at a time,
from a completely cold start. You do not need to understand how hosting works. You need to
tell it what you have and do what it says next. This is genuinely a solved problem and it
is not the hard part of your week.

**If you built it somewhere that already hosts it**, like Lovable, Replit, v0 or Bolt, you
are already done. Find the publish or deploy button, press it, and copy the URL it hands
you. That URL is what goes in the form.

**Everything else, pick one.** All free, and none of them affect your score.

| Where | Good for | Worth knowing |
|---|---|---|
| **GitHub Pages** | Plain HTML, CSS and JS with no build step | Free, tied to a repo, fewest moving parts. Start here if you have no opinion. |
| **Netlify** | A plain folder with an `index.html` in it | You can drag the folder onto their site and it deploys. No GitHub account needed. |
| **Vercel** | React, Next.js, Vite, most JavaScript projects | Connect your GitHub repo and it redeploys every time you push. |

**Don't spend more than five minutes choosing.** Any of them works. If you're stuck on the
choice, ask your agent which one fits what you built and then let it set that one up.

**Here's how to ask.** Give it this document and tell it exactly what you have:

> *"I have a [folder with an index.html / Vite React app / something else] and I have never
> deployed anything before. Walk me through getting it live on [GitHub Pages], one step at
> a time. Tell me when I need to make an account or click something, and don't assume I
> know what any of the words mean."*

Then keep asking. "It didn't work, here's the error." "What do I do next?" "I don't see the
button you're describing." That loop gets you there.

**Then confirm it worked.** Open the URL on your phone, or send it to a friend. If it loads
for them with your laptop closed, you're done and rule 3 is handled.

---

## If you get stuck

**Use your agent. That's the skill this session is actually teaching.**

Start by pasting this entire document into Claude or Codex and telling it where you are. It
has the prompt, the rules, the deadline and the format, so it can work out what you need
and walk you through it from there.

**Never built anything before? Never built anything *with* AI before? You're exactly who
this is for.** You do not need to understand how any of this works before Friday. You need
to be able to say what you want and then ask the next question.

Your agent will walk you through anything, one step at a time, as long as you tell it where
you actually are. That's the trick: being honest about your starting point. Not "how do I
build an app," but:

> *"I've never put a website online before. I have a folder with an index.html file in it.
> Walk me through getting it online one step at a time, and don't assume I know what any of
> the words mean."*

It will. Then you ask it the next thing, and the next. That loop works from a completely
cold start.

Things people feel stupid asking and absolutely should not:

- "What's a repository?"
- "Explain that like I've never seen code before."
- "I got this error and I don't understand it." Then paste the entire error, all of it.
- "I don't know what to ask you next."

**None of that is cheating. Asking well is the thing this club teaches.** If you're stuck
for more than ten minutes on the same thing, you've stopped learning and started guessing.
Go ask.

Officers can help with accounts, access and billing. Those are the things your agent
genuinely can't fix. Everything else, your agent is faster than we are.

---

## What you submit

By **Thursday 11:59 PM PDT**, in the form:

| | |
|---|---|
| **Your name** | Goes on the screen Friday. |
| **Project title** | |
| **Live URL** | Deployed and public. Has to work with your laptop closed. |
| **What problem does this solve?** | One sentence. This gets read out when you walk up. |
| **Can you be there Friday?** | Yes or no. Mandatory. See rule 5. |
| **First thing you've built and deployed?** | Yes or no. Never used against you. |

**Submit here: https://forms.gle/FLURyTn59ieRF1i4A**

Five minutes to fill out. There's no essay, no build write-up, nothing to upload. **The
demo is where you explain your build.** The form exists to get you on the list.

---

## How you're scored

Judges score **every demo, 1–10, on four things.** No deliberation, no politics. The
scores are averaged and the winners come straight out of the numbers.

| Score 1–10 | The question |
|---|---|
| **Usefulness** | Would a student actually use this repeatedly, next week and not just once? |
| **Execution** | Does it work for someone who isn't you? Empty states, bad input, someone clicking the wrong thing. |
| **Creativity** | How inventive is the solution? Did they find an angle on the problem you wouldn't have thought of? |
| **Demo clarity** | Did you clearly show it working, and could the room tell what it does? |

### The awards

**Top three by total score.** The four numbers get added up, averaged across judges, and
ranked. First, second, third.

That's the whole thing. The three highest scores win, the math is public, and nobody
deliberates. Ties break on Usefulness.

**All four count equally**, which means a quarter of your score is the demo itself. Rehearse
it. And a build that's useful but rough loses to one that's useful *and* works. If you have
to pick one thing to get right, **make it something people would actually use.**

---

## Prizes

**Top three. One month of Claude Max each (~$100).**

One prize per person, so three different people walk out with something.

---

## Tips that will actually help

1. **Hardcode your own data first.** Your real classes, your real assignments. Getting it to
   work for everyone is a Thursday problem and usually one you don't need to solve.
2. **Paste the entire error**, including the parts that look irrelevant. Summarizing an
   error is how you and your agent both end up guessing.
3. **Describe what you see, not what you think is wrong.** "The page is blank and the
   console says X" gets you further than "I think the API is broken."
4. **Heavier model for the first pass, lighter one for iterating.** People have run dry
   mid-build before. Don't burn your week's budget on a font.
5. **Send your link to someone before Thursday and watch them open it.** That catches what
   you can't see yourself, like a page that only works because you're already logged in.

---

## FAQ

**I've never built anything.** Good. That's who this is for. Start tonight, tell your agent
you're a beginner, and let it teach you as you go. See "If you get stuck" above. Half this
room was in the same place last spring.

**I've never used AI to build something.** Same answer. There's nothing to learn first.
Open it, describe what you want, and ask follow-up questions until it works.

**Can I work with a friend?** No. Individual only. Group work starts in October.

**Can I use something I already started?** New build for this prompt. Reuse the technique
all you want.

**What if it's not finished Thursday?** Submit it anyway, deployed. A working slice beats a
broken whole. Execution is scored on whether what exists actually works.

**Does it have to be a web app?** No. Any stack. But it has to be deployed and openable by
a stranger, which rules out most non-web builds in four days. Plan accordingly.

**What if I don't get picked to demo?** Not everyone who submits will demo. There are only
so many slots in the hour, and the lineup gets picked Friday morning from what's in the
form. Judges score what they watch, so if you don't demo you aren't scored and can't win.
Your build still goes up in Slack Friday morning and gets shown while the room is trying
each other's builds. Submit early and strong.

**What if my idea is dumb?** If it solves something that actually annoys you, it's not dumb,
it's specific. Specific is what you want. Build it.

---

**One more thing.** Ambassador applications close **Sunday at 11:59 PM.** If you've been
thinking about it, that's your deadline.
