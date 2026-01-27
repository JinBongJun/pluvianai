# AgentGuard Standard AI Rubrics

> **Open Source AI Evaluation Standards**

This directory contains the standard evaluation rubrics used by AgentGuard to assess AI model outputs. These rubrics are open source and designed to become industry standards for AI quality evaluation.

## Contents

- **[STANDARD_AI_RUBRICS.md](./STANDARD_AI_RUBRICS.md)**: Core evaluation methodology and scoring criteria
- **[RUBRIC_TEMPLATES.md](./RUBRIC_TEMPLATES.md)**: Pre-configured rubrics for common use cases

## Quick Start

### Understanding Quality Scores

AgentGuard calculates a Quality Score (0-100) based on multiple dimensions:

1. **Semantic Consistency** (40%): Does the response address the user's intent?
2. **Tone & Style** (20%): Is the tone appropriate for the context?
3. **Coherence** (20%): Is the response logically structured?
4. **Format** (10%): Does it follow required format (JSON, etc.)?
5. **Completeness** (10%): Is all necessary information included?

### Using Standard Rubrics

The standard rubrics are automatically applied when evaluating API calls in AgentGuard. You can also customize them for your specific use case.

### Custom Rubrics

See [RUBRIC_TEMPLATES.md](./RUBRIC_TEMPLATES.md) for domain-specific templates:
- Code Generation
- Translation
- Summarization
- Question Answering
- Creative Writing
- Data Extraction

## Implementation

### AgentGuard Backend

The rubrics are implemented in:
- `backend/app/services/quality_evaluator.py`: Core evaluation logic
- `backend/app/services/judge_service.py`: LLM-as-a-Judge implementation
- `backend/app/models/evaluation_rubric.py`: Rubric data model

### API Usage

```bash
# Evaluate API calls
POST /api/v1/quality/evaluate
{
  "api_call_ids": [1, 2, 3],
  "expected_schema": {...},
  "required_fields": ["field1", "field2"]
}
```

## Contributing

We welcome contributions to improve these rubrics:

1. **Propose improvements**: Suggest better scoring criteria or weights
2. **Add templates**: Create rubrics for new use cases
3. **Share feedback**: Report issues or suggest enhancements

## License

MIT License - See LICENSE file for details

## Community

- **GitHub**: [agentguard/agentguard](https://github.com/agentguard/agentguard)
- **Documentation**: [docs.agentguard.ai](https://docs.agentguard.ai)
- **Discord**: [Join our community](https://discord.gg/agentguard)

## Version

Current version: **1.0.0**

Last updated: 2026-01-26
