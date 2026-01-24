# 🧠 LLM-as-a-Judge (Technical Deep Dive)

This document explains the technical implementation of Phase 3: Intelligence.

## 📋 Evaluation Rubrics
Developers define rubrics that act as the prompt-instructions for the judge.
*   **Storage**: `evaluation_rubrics` table.
*   **Fields**: `criteria_prompt` (The instruction), `min_score`, `max_score`.

## ⚖️ The Judging Pipeline
When a Replay is triggered with a `rubric_id`:
1.  **Re-execution**: `ReplayService` runs the new prompt/model.
2.  **Context Fetch**: It fetches the original response from the `api_calls` table.
3.  **LLM Call**: It sends both (Original vs. Replayed) to `GPT-4o-mini`.
4.  **Prompting**:
    ```text
    Compare ORIGINAL and REPLAYED.
    Rubric: [Name]
    Criteria: [Instructions]
    Output strictly JSON: {original_score, replayed_score, reasoning, regression_detected}
    ```

## 📊 Visualizing Results
The frontend (`ReplayPage`) renders the `res.evaluation` object:
*   **Success**: Displays a green/slate score card.
*   **Regression**: Displays a bright red warning if the new score is lower than the original.
*   **Reasoning**: Provides the LLM's explanation for the score shift.

## 🧪 Current Status & Next Steps
*   **API**: `POST /api/v1/replay/{project_id}/run` now supports `rubric_id`.
*   **Future**: Multi-rubric scoring and weighted performance indices.
