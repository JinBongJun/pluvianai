# Rubric Templates

> **Pre-configured evaluation rubrics for common use cases**

This document provides ready-to-use rubric templates for different AI application domains.

## General AI Response Evaluation

**Use Case**: General-purpose AI responses (chatbots, assistants, etc.)

**Weights**:
- Semantic Consistency: 40%
- Tone & Style: 20%
- Coherence: 20%
- Format: 10%
- Completeness: 10%

**Criteria**:
- Response addresses user intent
- Appropriate tone for context
- Logical flow and structure
- Complete information provided

## Code Generation Evaluation

**Use Case**: AI-generated code (functions, classes, scripts)

**Weights**:
- Syntax Validity: 30%
- Logical Correctness: 40%
- Code Style: 15%
- Documentation: 15%

**Criteria**:
- **Syntax Validity**: Code compiles/parses without errors
- **Logical Correctness**: Code logic is sound and produces expected results
- **Code Style**: Follows language conventions and best practices
- **Documentation**: Includes comments and docstrings where appropriate

**Example**:
```python
code_rubric = {
    "syntax_validity": {
        "weight": 0.30,
        "check": "Code parses without syntax errors"
    },
    "logical_correctness": {
        "weight": 0.40,
        "check": "Code produces correct output for test cases"
    },
    "code_style": {
        "weight": 0.15,
        "check": "Follows PEP 8 (Python) or equivalent style guide"
    },
    "documentation": {
        "weight": 0.15,
        "check": "Includes docstrings and inline comments"
    }
}
```

## Translation Evaluation

**Use Case**: Machine translation between languages

**Weights**:
- Accuracy: 40%
- Fluency: 30%
- Style Preservation: 20%
- Completeness: 10%

**Criteria**:
- **Accuracy**: Correct translation of meaning
- **Fluency**: Natural-sounding target language
- **Style Preservation**: Maintains original tone and style
- **Completeness**: All content translated

**Example**:
```python
translation_rubric = {
    "accuracy": {
        "weight": 0.40,
        "check": "Meaning accurately preserved"
    },
    "fluency": {
        "weight": 0.30,
        "check": "Natural target language"
    },
    "style_preservation": {
        "weight": 0.20,
        "check": "Original tone maintained"
    },
    "completeness": {
        "weight": 0.10,
        "check": "All content translated"
    }
}
```

## Summarization Evaluation

**Use Case**: Text summarization (articles, documents, conversations)

**Weights**:
- Information Coverage: 40%
- Conciseness: 25%
- Coherence: 20%
- Relevance: 15%

**Criteria**:
- **Information Coverage**: Key points included
- **Conciseness**: Appropriate length, no redundancy
- **Coherence**: Logical flow and structure
- **Relevance**: Only relevant information included

**Example**:
```python
summarization_rubric = {
    "information_coverage": {
        "weight": 0.40,
        "check": "All key points included"
    },
    "conciseness": {
        "weight": 0.25,
        "check": "Appropriate length, no redundancy"
    },
    "coherence": {
        "weight": 0.20,
        "check": "Logical flow"
    },
    "relevance": {
        "weight": 0.15,
        "check": "Only relevant information"
    }
}
```

## Question Answering Evaluation

**Use Case**: Q&A systems, knowledge bases

**Weights**:
- Answer Accuracy: 45%
- Completeness: 25%
- Clarity: 20%
- Source Attribution: 10%

**Criteria**:
- **Answer Accuracy**: Correct information provided
- **Completeness**: Fully addresses the question
- **Clarity**: Clear and understandable response
- **Source Attribution**: Sources cited (if applicable)

**Example**:
```python
qa_rubric = {
    "answer_accuracy": {
        "weight": 0.45,
        "check": "Correct information"
    },
    "completeness": {
        "weight": 0.25,
        "check": "Fully addresses question"
    },
    "clarity": {
        "weight": 0.20,
        "check": "Clear and understandable"
    },
    "source_attribution": {
        "weight": 0.10,
        "check": "Sources cited"
    }
}
```

## Creative Writing Evaluation

**Use Case**: Creative content generation (stories, articles, marketing copy)

**Weights**:
- Creativity: 30%
- Narrative Flow: 25%
- Style Consistency: 25%
- Engagement: 20%

**Criteria**:
- **Creativity**: Original and engaging content
- **Narrative Flow**: Smooth story progression
- **Style Consistency**: Consistent voice and tone
- **Engagement**: Captivating and interesting

**Example**:
```python
creative_rubric = {
    "creativity": {
        "weight": 0.30,
        "check": "Original and engaging"
    },
    "narrative_flow": {
        "weight": 0.25,
        "check": "Smooth progression"
    },
    "style_consistency": {
        "weight": 0.25,
        "check": "Consistent voice"
    },
    "engagement": {
        "weight": 0.20,
        "check": "Captivating content"
    }
}
```

## Data Extraction Evaluation

**Use Case**: Structured data extraction from unstructured text

**Weights**:
- Extraction Accuracy: 50%
- Field Completeness: 30%
- Format Correctness: 20%

**Criteria**:
- **Extraction Accuracy**: Correctly extracted values
- **Field Completeness**: All required fields extracted
- **Format Correctness**: Data in correct format

**Example**:
```python
extraction_rubric = {
    "extraction_accuracy": {
        "weight": 0.50,
        "check": "Correctly extracted values"
    },
    "field_completeness": {
        "weight": 0.30,
        "check": "All required fields present"
    },
    "format_correctness": {
        "weight": 0.20,
        "check": "Data in correct format"
    }
}
```

## Using Templates

### In AgentGuard

You can use these templates by creating custom EvaluationRubric records:

```python
from app.models.evaluation_rubric import EvaluationRubric

# Create a code generation rubric
code_rubric = EvaluationRubric(
    name="Code Generation",
    criteria_prompt="Evaluate code for syntax validity, logical correctness, style, and documentation",
    min_score=0,
    max_score=100,
    weights={
        "syntax_validity": 0.30,
        "logical_correctness": 0.40,
        "code_style": 0.15,
        "documentation": 0.15
    }
)
```

### Customization

All templates can be customized:

1. **Adjust weights**: Change the importance of different criteria
2. **Add criteria**: Include domain-specific evaluation dimensions
3. **Modify thresholds**: Change scoring ranges for your use case

## Contributing Templates

We welcome contributions of new rubric templates:

1. **Identify use case**: What domain or task does this rubric address?
2. **Define dimensions**: What aspects should be evaluated?
3. **Set weights**: How important is each dimension?
4. **Provide examples**: Include usage examples and test cases

## References

- Standard AI Rubrics: [STANDARD_AI_RUBRICS.md](./STANDARD_AI_RUBRICS.md)
- AgentGuard Quality Evaluator: `backend/app/services/quality_evaluator.py`
