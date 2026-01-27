# Standard AI Rubrics

> **Open Source AI Evaluation Standards**  
> Industry-standard rubrics for evaluating AI model outputs

## Overview

This document defines the standard evaluation rubrics used by AgentGuard to assess AI model outputs. These rubrics are designed to be:

- **Transparent**: Clear scoring criteria and weights
- **Reproducible**: Consistent evaluation across different models
- **Comprehensive**: Cover multiple dimensions of quality
- **Extensible**: Easy to customize for specific use cases

## Quality Score Calculation

The overall Quality Score is calculated as a weighted average of multiple sub-scores:

```
Quality Score = (
    semantic_consistency_score * 0.40 +
    tone_score * 0.20 +
    coherence_score * 0.20 +
    format_score * 0.10 +
    completeness_score * 0.10
)
```

### Score Ranges

- **0-50**: Poor quality - Significant issues detected
- **51-70**: Fair quality - Some issues present
- **71-85**: Good quality - Minor issues
- **86-100**: Excellent quality - Meets or exceeds expectations

## Evaluation Dimensions

### 1. Semantic Consistency (Weight: 40%)

**Definition**: The response accurately addresses the user's intent and maintains semantic alignment with the input.

**Scoring Criteria**:
- **90-100**: Perfectly addresses the intent, no semantic drift
- **75-89**: Mostly accurate, minor semantic deviations
- **60-74**: Somewhat relevant but misses key aspects
- **40-59**: Significant semantic drift, partially off-topic
- **0-39**: Completely off-topic or irrelevant

**Evaluation Method**:
- LLM-as-a-Judge with structured prompt
- Comparison against expected semantic fields
- Context-aware evaluation

### 2. Tone & Style (Weight: 20%)

**Definition**: The response maintains appropriate tone and style for the context.

**Scoring Criteria**:
- **90-100**: Perfect tone, professional and appropriate
- **75-89**: Good tone with minor inconsistencies
- **60-74**: Acceptable but some tone issues
- **40-59**: Inappropriate tone for context
- **0-39**: Unprofessional or offensive tone

**Evaluation Method**:
- Sentiment analysis
- Style consistency checks
- Context-appropriate tone validation

### 3. Coherence (Weight: 20%)

**Definition**: The response is logically structured and flows naturally.

**Scoring Criteria**:
- **90-100**: Highly coherent, logical flow
- **75-89**: Mostly coherent, minor flow issues
- **60-74**: Somewhat coherent but disjointed
- **40-59**: Poor coherence, confusing structure
- **0-39**: Incoherent, nonsensical

**Evaluation Method**:
- Logical flow analysis
- Sentence structure evaluation
- Transition quality assessment

### 4. Format & Structure (Weight: 10%)

**Definition**: The response follows required format (JSON, structured data, etc.).

**Scoring Criteria**:
- **100**: Valid format, all required fields present
- **75**: Valid format, some optional fields missing
- **50**: Invalid format but recoverable
- **0**: Invalid format, cannot be parsed

**Evaluation Method**:
- JSON schema validation
- Required field checks
- Format pattern matching

### 5. Completeness (Weight: 10%)

**Definition**: The response includes all necessary information.

**Scoring Criteria**:
- **90-100**: Complete, all required information present
- **75-89**: Mostly complete, minor gaps
- **60-74**: Partially complete, some missing information
- **40-59**: Incomplete, significant gaps
- **0-39**: Severely incomplete

**Evaluation Method**:
- Required field presence checks
- Information coverage analysis
- Completeness scoring

## Rule-Based Checks

In addition to LLM-based evaluation, AgentGuard performs rule-based checks:

### JSON Validity
- **Check**: Valid JSON syntax
- **Weight**: Binary (pass/fail)
- **Impact**: Format score component

### Required Fields
- **Check**: All required fields present
- **Weight**: Binary (pass/fail)
- **Impact**: Completeness score component

### Length Acceptability
- **Check**: Response length within acceptable range
- **Weight**: Binary (pass/fail)
- **Impact**: Coherence score component

## Customization

### Adjusting Weights

You can customize the scoring weights for your use case:

```python
# Example: Emphasize semantic consistency
weights = {
    "semantic_consistency": 0.50,  # Increased from 0.40
    "tone": 0.15,                   # Decreased from 0.20
    "coherence": 0.15,              # Decreased from 0.20
    "format": 0.10,
    "completeness": 0.10
}
```

### Adding Custom Criteria

You can extend the rubric with domain-specific criteria:

```python
# Example: Code generation rubric
code_quality_rubric = {
    "syntax_validity": 0.30,
    "logical_correctness": 0.40,
    "code_style": 0.15,
    "documentation": 0.15
}
```

## Implementation

### AgentGuard Implementation

The standard rubrics are implemented in:
- `backend/app/services/quality_evaluator.py`: Core evaluation logic
- `backend/app/models/evaluation_rubric.py`: Rubric model
- `backend/app/services/judge_service.py`: LLM-as-a-Judge implementation

### Usage Example

```python
from app.services.quality_evaluator import QualityEvaluator

evaluator = QualityEvaluator()
score = await evaluator.evaluate(
    api_call=api_call,
    expected_schema=None,
    required_fields=None
)

print(f"Quality Score: {score.overall_score}")
print(f"Semantic Consistency: {score.semantic_consistency_score}")
print(f"Tone: {score.tone_score}")
print(f"Coherence: {score.coherence_score}")
```

## Contributing

We welcome contributions to improve these rubrics:

1. **Propose new dimensions**: Add evaluation criteria relevant to your domain
2. **Refine scoring**: Suggest improvements to scoring criteria
3. **Share use cases**: Document how you've customized rubrics for your needs

## License

This rubric is open source and available under the MIT License.

## References

- AgentGuard Quality Evaluator: `backend/app/services/quality_evaluator.py`
- LLM-as-a-Judge Implementation: `backend/app/services/judge_service.py`
- Evaluation Rubric Model: `backend/app/models/evaluation_rubric.py`
