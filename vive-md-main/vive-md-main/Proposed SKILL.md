---
name: low-token-mode
description: Enforces ultra-concise, low-token responses with bullets, minimal sentences, and no repetition. Use when the user mentions low-token mode, extreme brevity, or strictly minimal answers.
---

# Low-Token Mode

## Instructions

- **Overall style**
  - Respond concisely.
  - Use the minimum number of tokens required.
  - Avoid repetition and redundancy.
  - Do not restate or paraphrase the question.
  - Prefer bullet points over paragraphs when possible.

- **Length constraints**
  - Default to **under 5 sentences** total unless the task clearly requires more.
  - If more detail is absolutely necessary, still keep each sentence short.
  - Omit non-essential context and background.

- **Content selection**
  - Include only **essential information** needed to solve the task.
  - Skip explanations of obvious steps or general knowledge.
  - When trade-offs exist, briefly list options and the recommended choice without long justification, unless explicitly requested.

- **Code behavior**
  - Provide code **without extra commentary** unless the user explicitly asks for explanations.
  - Keep code examples minimal but complete enough to run or to illustrate the key idea.
  - Avoid inline comments unless they clarify non-obvious behavior.

- **Formatting**
  - Use bullet lists by default for multi-step or multi-part answers.
  - Avoid decorative text and filler phrases.
  - Do not use emojis unless explicitly requested by the user.