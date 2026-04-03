---
title: '"Looks fine" isn''t evidence: Why 1 spot check hides silent LLM regression'
date: '2026-04-03'
excerpt: "LLMs don't produce a single output. If you are shipping AI features to production relying on single spot-checks, you are shipping blind."
tags: ['LLM', 'Testing', 'Engineering']
---

LLMs don't produce a single output.
So why do we test them like they do?

If you are shipping AI features to production, chances are you've experienced this nightmare loop:
You identify an edge case where an agent breaks. You patch the system prompt. You run a spot test in your dev environment. It looks fine. Dashboards are green. You click deploy. 
And two days later, behavior mysteriously changes in production.

This drove our team crazy until we realized what we were doing wrong. We were testing what the output *looked like* on a single run, instead of testing the **behavior distribution**.

### The Danger of Silent Behavioral Drift

When you change a system prompt, you expect the output text to change. But what you usually don't see is **Behavioral Drift**.

For example, your support bot might still eventually answer the user's question, but because of your new prompt instruction, it started calling your internal APIs in a different order, or it took 3 extra loop steps to get there.

The final output is identical. But latency just spiked by 40%. The grounding is gone. The agent is now calling tools unpredictably. A standard "LLM-as-a-judge" usually won't catch this because the text output *looks* correct.

### The Fix: Multi-run Simulation & The "Flaky" Metric

We realized that testing an LLM app means treating it like a chaotic system. A single "PASS" means nothing.

To stop these regressions, we built a **Pre-Deploy Release Gate** workflow. Before we ship any changes to prompts, models, or orchestration, we force it to prove its stability.

Here is exactly how we do it, without using slow, expensive LLM-judges:

**1. Capture real cases, not synthetic data**
We save a tight set of real production inputs. Synthetic data misses the weirdness of real users. We treat these saved cases as our ground truth dataset.

**2. Multi-run Simulation (Catch the Flakiness)**
A single spot check tells you nothing about variance. We run the old, known-good trace against the new candidate prompt multiple times—whether that's **10x for a quick sanity check, or 50x to 100x for a rigorous statistical threshold**.

![Release Gate Dashboard](/images/screenshot.png)
As you can see in our actual regression UI: Under a repeat test, some cases stay perfectly **Healthy (10/10)**. But one case suddenly failed 4 out of 10 times due to latency spikes and missing required keywords. 
If we had only tested it 1 time (spot check), we would have had a 60% chance of passing it and shipping a broken sequence to production.

**3. Tool Sequence Edit Distance**
Outputs might look the same, but the underlying mechanics break. We stopped analyzing the output text and started analyzing the engine. We normalize tool calls into an AST-like tree and compute the **Levenshtein edit distance** on the tool execution graph. If the agent subtly swaps the order of operations, the regression gate blocks the deploy immediately.

### Stop gambling with Spot Checks

"Looks fine" isn't evidence. If you want to deploy agents safely, you need to test what actually matters: real user inputs at scale, repeated enough times to measure the true variance.

We formalised this CI/CD pattern into a tool called **[PluvianAI](https://www.pluvianai.com/)**, which handles the traffic capture, baseline saving, and the repeat pre-deploy gating automatically. 

If you want to see the exact code that reproduces this silent flaky behavior, I put together a minimal repro repo here: [support-bot-regression-demo](https://github.com/JinBongJun/support-bot-regression-demo) 

How is your team deciding what counts as "enough evidence" before shipping an LLM change? Let me know.
