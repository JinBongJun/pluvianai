# LLM Evaluation Market Research — Accuracy Supplement (V2)

**Supplement Date**: February 2026  
**Purpose**: Clarify scale (“how many people”), recency, and methodology so the original findings are interpreted correctly.

---

## 1. What We Can and Cannot Say About “How Many People”

### 1.1 Original Study (LLM_EVAL_MARKET_RESEARCH.md)

- **Sample size**: **110 posts/comments/issues** (not 110 unique people).
  - One person can have multiple posts; we did not deduplicate by author.
- **Breakdown**: Reddit 60, GitHub Issues 30, Hacker News 20.
- **Classification**: S1 = 12, S2 = 68, S3 = 30 (percentages are of 110, not of a population).

### 1.2 What “110” Means

- **We can say**: “In this sample of 110 posts, 10.9% showed explicit willingness to pay (S1), 61.8% showed strong need (S2), 25.5% mentioned building internal tools, 30.9% mentioned production break or deployment fear.”
- **We cannot say**: “X% of all developers” or “Y people globally are in pain.” We have no census or random sample of the developer population.

### 1.3 Ecosystem Scale (Independent of the 110)

As of 2025–2026 public data:

| Source | Metric | Implication |
|--------|--------|-------------|
| **Promptfoo** (GitHub) | ~10.5k stars, 934 forks | Large interest in “test prompts/agents/RAG, CI/CD” tooling |
| **DeepEval** (Confident AI) | ~13.7k stars, 240 contributors | Large interest in LLM evaluation framework |
| **Braintrust** (GitHub org) | autoevals 808+, multiple SDKs | Commercial + OSS adoption in eval space |
| **HN** (LLM Evaluation Review) | “11 YC companies in LLM evaluation” | Investor-backed category |

So we can say: **tens of thousands of developers** have shown interest in this category (stars/forks/contributors), and **multiple funded companies** exist. That supports “there is a market,” not “we know how many people are in pain.”

---

## 2. Recency of the Original Study

- **Report date**: February 18, 2026 (as stated in the original doc).
- **Source dates**: The original report does **not** list the exact post/issue date for each of the 110 items. HN item IDs and Reddit/GitHub links can be used to infer approximate time windows, but the report itself does not state “all data from 2024–2025” or similar.
- **Follow-up (Feb 2026)**: Web search for **2025–2026** content shows:
  - **Reddit**: Active threads on LLM consistency testing (r/AI_Agents), LLM-as-judge trust (r/QualityAssurance), RAG/LLM pipeline debugging (r/SideProject). No single “number of complainers”; discussions are ongoing.
  - **HN**: Discussions on LLM evals, Braintrust/DeepEval launches, and production issues exist; exact post dates vary by thread.
  - **GitHub**: Promptfoo and DeepEval have recent issues and releases (e.g. 2025); ecosystem is active.
  - **Research**: 2025 papers (e.g. PromptPex for prompt unit tests, Evidently/DeepEval regression testing in CI/CD) confirm the problem space is current.

**Conclusion**: The **topic** is current (2025–2026). The **original 110 sample** should be described as “a convenience sample of 110 posts/issues” with **no claim that all are from a single recent time window** unless each source is dated individually.

---

## 3. How Many People Are “Experiencing Discomfort”?

- **From the 110-sample only**: We can say that in that set, **68 (61.8%)** showed strong need (S2) and **34 (30.9%)** mentioned production break or deployment fear. That is “68 and 34 out of 110,” not “68% of developers.”
- **From ecosystem**: High GitHub engagement (10k+ stars for leading tools) and “11 YC companies” suggest **many developers and teams care about this problem**, but we do not have a head count of “people in discomfort.”
- **Accurate phrasing**: “Among 110 analyzed posts, a majority showed strong need or pain; ecosystem size (GitHub stars, YC-backed companies) suggests the problem is widespread” — not “X million people are in pain.”

---

## 4. Methodology Notes (Accuracy)

- **Sample design**: Convenience sample (search-driven), not random. Reddit/HN/GitHub users who post are self-selected; they may over-represent pain or early adopters.
- **Classification**: S1/S2/S3 and flags (internal tool, production break, deployment fear) are subjective; no inter-rater reliability reported.
- **URLs**: Some links in the original appendix may require login, or content may change; we did not re-verify every URL in this supplement.

---

## 5. Revised Summary for Stakeholders

- **Market exists**: Yes — strong interest (GitHub stars, YC companies, paid tools like Braintrust in use).
- **Pain exists**: Yes — in our 110-post sample, 61.8% S2, 30.9% pain-related mentions; recent 2025 discussions and papers align with the same themes (manual testing, regression, deployment fear).
- **Recency**: The **problem space** is current (2025–2026). The **original 110** should be cited as “a sample of 110 posts/issues” with time range clarified if needed.
- **“How many people”**: We do **not** have a population estimate. We have sample counts (e.g. 12 S1, 68 S2 out of 110) and ecosystem-level signals (tens of thousands of developers engaging with eval tools).

---

## 6. Recommendation

- Use the **original report** for: quotes, themes, S1/S2/S3 breakdown, and value propositions.
- Use this **V2 supplement** for: accurate wording on scale (“110 posts,” “sample,” “ecosystem size”), recency (“topic is current; sample dates not uniformly stated”), and limitations.
- When presenting externally: say “in a sample of 110 posts” and “ecosystem signals (e.g. 10k+ GitHub stars for eval tools)” rather than “X% of developers” or “Y people are in pain.”

---

---

## 7. Follow-Up Verification (Feb 2026 Web Search)

| Check | Result |
|-------|--------|
| **Promptfoo** (github.com/promptfoo/promptfoo) | 10,575 stars, 934 forks (as of fetch). “Powers LLM apps serving 10M+ users in production.” |
| **DeepEval** (confident-ai/deepeval) | 13,745 stars, 240 contributors; v3.8.5 Dec 2025. Regression testing in CI/CD documented. |
| **Braintrust** (braintrustdata) | autoevals 808+ stars; braintrust-sdk, proxy, etc. Commercial adoption (e.g. Coda) cited on HN. |
| **Reddit (2025)** | r/AI_Agents (LLM consistency), r/QualityAssurance (LLM-as-judge), r/SideProject (RAG/LLM debug checklist). No aggregate “number of sufferers” available. |
| **Research (2025)** | PromptPex (prompt unit tests), Evidently/DeepEval regression in CI/CD; manual eval “highly unreliable” when gold labels absent (Prompting in the Dark). |

**Conclusion**: Ecosystem and topic are current; original 110-sample conclusions (pain, willingness to pay, internal tool building) are consistent with 2025–2026 activity. For “how many people,” use sample + ecosystem wording only.

---

**Document**: LLM_EVAL_MARKET_RESEARCH_V2.md (Accuracy Supplement)  
**Companion**: LLM_EVAL_MARKET_RESEARCH.md (original findings and quotes)
