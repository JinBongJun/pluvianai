# LinkedIn Feedback Notes — 2026-04-10

## Why This Note Exists

This document captures early learning from LinkedIn outreach so the team can improve:

- connection request wording
- follow-up message wording
- positioning clarity
- distinction between deploy-risk detection and generic LLM evaluation

## Current Read

The first meaningful LinkedIn reply did not reject the problem.
Instead, it reframed the problem using familiar categories:

- LLM as a judge
- sampling controls (temperature / nucleus sampling)
- standard eval datasets
- observability platforms

This is useful because it shows how technically strong builders initially interpret the problem.

## What The Reply Suggested

### 1. People may default to answer-quality framing

The reply naturally shifted toward:

- judge-based evaluation
- deterministic output controls
- standard dataset-based evaluation

This suggests that if our wording is too broad, people may assume the problem is:

- answer quality
- hallucination control
- standard model evaluation

rather than:

- workflow instability
- repeated-run variance
- deploy safety
- path / retry / tool drift

### 2. We need to state the distinction more explicitly

The reply confirms that our language should more clearly separate:

- `answer grading`

from:

- `workflow-level instability across repeated replay before deploy`

This distinction should appear more directly in future messages.

### 3. The respondent remained open to discussion

The reply included a key opening:

- `would like to know more about the context of the specific problem`

This is important.
It means the outreach did not fail.
It created enough interest for a more specific clarification.

## Strong Phrases To Carry Forward

- `LLM as a judge`
- `temperature and nucleus samples`
- `standard dataset of evals`
- `observatory and llm evaluation`

These are not our core positioning phrases, but they are useful because they show the mental models people bring into the conversation.

## Positioning Clarification Needed

Future messaging should state more clearly:

- we are not only talking about answer quality
- we are not only asking how to grade outputs
- we are looking at cases where the same saved input can produce different tool paths, retries, or stability outcomes across repeated runs
- the core question is what teams trust before deploy when workflow-level instability appears

## Recommended Message Direction

Stronger phrasing:

- `I’m less focused on answer grading and more on workflow-level instability across repeated replay before deploy.`
- `The issue I’m looking at is when the same saved input leads to different tool paths, retries, or stability outcomes across repeated runs.`
- `I’m trying to understand what teams trust most before deploy in that situation.`

## Practical Implication

LinkedIn conversations may require a faster clarification step than Reddit.

On Reddit, people often elaborate publicly on process and deploy bars.
On LinkedIn, technically strong respondents may first map the problem to existing categories they already know.

That means:

- initial DM can stay broad and conversational
- first follow-up should sharpen the distinction between:
  - answer evaluation
  - workflow instability and deploy risk

## Bottom Line

The first meaningful LinkedIn reply suggests:

- the problem is interesting enough to continue discussing
- our wording still needs to sharpen the difference between generic eval and deploy-risk detection
- follow-up clarification should emphasize repeated replay, workflow instability, and tool / retry drift

---

## 2026-04-24 Public Post Update

We moved from pure DM/problem-discovery mode into a more explicit public-post mode.

The public LinkedIn post shifted from:

- asking broad questions about evaluation

to:

- stating a clearer point of view:
  - `For AI agents, final answer quality and deploy safety are not the same thing.`
  - repeated runs on the same saved input can expose tool-path drift, retry drift, latency variance, and output-structure change underneath

### What Changed Strategically

- we stopped using LinkedIn only as a place to ask what others do
- we started using it to claim the framing more directly
- we allowed light product mention in the body instead of keeping the whole post product-silent

### Why This Matters

The earlier DM feedback showed that people default to:

- answer grading
- LLM-as-a-judge
- standard eval datasets

The public post counteracts that by making the distinction earlier and more explicitly:

- not just `did the output pass?`
- but `did the workflow stay stable enough across repeated replay to trust the release?`

### Practical Takeaway

For future public LinkedIn posts:

- keep `AI agents` or `LLM workflow changes` in the opening line
- make the deploy-risk distinction explicit in the first 2-3 lines
- use one concrete list of instability signals:
  - tool paths
  - retries
  - latency
  - output structure
- product mention is acceptable when it comes after the framing, not before it
