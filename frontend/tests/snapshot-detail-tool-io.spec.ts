import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function gotoFixture(page: Page, caseId: string) {
  await page.goto(`/test/snapshot-detail-fixtures?case=${encodeURIComponent(caseId)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Snapshot Detail Fixture Playground")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("Snapshot Details")).toBeVisible({ timeout: 15000 });
}

test.describe("Snapshot detail tool UI", () => {
  test.describe.configure({ mode: "serial" });

  test("legacy empty snapshot shows all three tool empty states", async ({ page }) => {
    await gotoFixture(page, "legacy-empty");

    await expect(page.getByText("Tool calls (provider summary)")).toBeVisible();
    await expect(page.getByText("No provider tool_calls summary on this snapshot.")).toBeVisible();
    await expect(
      page.getByText(
        "Summaries appear when the captured LLM response includes tool_calls or when ingest stores tool_calls_summary."
      )
    ).toBeVisible();

    await expect(page.getByText("Tool timeline (calls & I/O)")).toBeVisible();
    await expect(page.getByText("No tool_call / tool_result timeline for this snapshot.")).toBeVisible();
    await expect(
      page.getByText(
        "Send tool_events from the SDK on POST …/api-calls, or capture provider responses that include tool calls."
      )
    ).toBeVisible();

    await expect(page.getByText("Actions (side effects)")).toBeVisible();
    await expect(
      page.getByText("No outbound actions (email, Slack, HTTP, etc.) recorded for this snapshot.")
    ).toBeVisible();

    await expect(page.getByText("Agent Response")).toBeVisible();
    await expect(
      page.getByText(
        "Please rotate the key, confirm the old key is revoked, and verify the integration with a fresh request."
      )
    ).toBeVisible();
  });

  test("summary only snapshot renders provider summary but leaves timeline empty", async ({
    page,
  }) => {
    await gotoFixture(page, "summary-only");

    await expect(page.getByText("Tool calls (provider summary)")).toBeVisible();
    await expect(page.getByText("get_weather")).toBeVisible();
    await expect(page.getByText('"city": "Seoul"')).toBeVisible();
    await expect(page.getByText('"units": "metric"')).toBeVisible();

    await expect(page.getByText("No tool_call / tool_result timeline for this snapshot.")).toBeVisible();
    await expect(
      page.getByText("No outbound actions (email, Slack, HTTP, etc.) recorded for this snapshot.")
    ).toBeVisible();
    await expect(page.getByText("Agent Response")).toBeVisible();
  });

  test("payload fallback snapshot renders ingest-backed tool timeline and actions", async ({
    page,
  }) => {
    await gotoFixture(page, "payload-fallback");
    const toolCallRow = page.getByLabel(/Tool timeline row 1.*tool_call/i);
    const toolResultRow = page.getByLabel(/Tool timeline row 2.*tool_result/i);
    const actionRow = page.getByLabel(/Tool timeline row 1.*action/i);

    await expect(page.getByText("Tool timeline (calls & I/O)")).toBeVisible();
    await expect(page.getByText("Actions (side effects)")).toBeVisible();

    await expect(page.getByText("tool_call", { exact: true })).toBeVisible();
    await expect(page.getByText("tool_result", { exact: true })).toBeVisible();
    await expect(page.getByText("action", { exact: true })).toBeVisible();
    await expect(page.getByText("get_weather").first()).toBeVisible();
    await expect(page.getByText("send_slack").first()).toBeVisible();
    await expect(page.getByText("Ingest").first()).toBeVisible();
    await expect(toolCallRow.getByText('"city": "Seoul"')).toBeVisible();
    await expect(toolResultRow.getByText('"temp_c": 22')).toBeVisible();
    await expect(actionRow.getByText('"channel": "#support-escalations"')).toBeVisible();
  });

  test("trajectory snapshot prefers trajectory-backed rows over payload values", async ({
    page,
  }) => {
    await gotoFixture(page, "trajectory-preferred");
    const trajectoryCallRow = page.getByLabel(/Tool timeline row 1.*tool_call/i);
    const trajectoryResultRow = page.getByLabel(/Tool timeline row 2.*tool_result/i);

    await expect(page.getByText("trajectory_lookup").first()).toBeVisible();
    await expect(page.getByText("Trajectory").first()).toBeVisible();
    await expect(trajectoryCallRow.getByText('"query": "refund policy"')).toBeVisible();
    await expect(trajectoryResultRow.getByText('"article_id": "kb_42"')).toBeVisible();
    await expect(page.locator("text=payload_lookup")).toHaveCount(0);
    await expect(page.locator('text="legacy payload result"')).toHaveCount(0);
  });

  test("snapshot flagged with tool calls but missing summary shows targeted empty copy", async ({
    page,
  }) => {
    await gotoFixture(page, "has-tool-calls-no-summary");

    await expect(
      page.getByText("This snapshot is flagged as having tool calls, but no argument summary was stored.")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Open a fresh capture after ingest, or confirm the proxy/SDK stores tool_calls_summary when available."
      )
    ).toBeVisible();
    await expect(page.getByText("Agent Response")).toBeVisible();
  });

  test("empty tool_events payload shows ingest-specific timeline empty copy", async ({ page }) => {
    await gotoFixture(page, "empty-tool-events");

    await expect(page.getByText("tool_events was sent on ingest but is empty for this request.")).toBeVisible();
    await expect(
      page.getByText(
        "Record tool_call / tool_result (and optional action) rows from your agent so the timeline can render."
      )
    ).toBeVisible();
    await expect(
      page.getByText("No outbound actions (email, Slack, HTTP, etc.) recorded for this snapshot.")
    ).toBeVisible();
  });
});
