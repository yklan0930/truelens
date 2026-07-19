# TrueLens QA Report — 2026-07-19

Run at: 2026-07-19 03:16:50
API: https://truelens.top
Tests: 17 | Passed: 7 | Failed: 10 | Errors: 0
Accuracy: 41.2

## Metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| ai | 100.0% | 66.7% | 80.0% |
| real | 12.5% | 100.0% | 22.2% |

## Per-Test

| File | Expect | Actual | AI味 | Status |
|---|---|---|---|---|
| ai-beach.jpg | ai | uncertain | 51% | FAIL |
| ai-cat.jpg | ai | ai | 97% | OK |
| ai-food.jpg | ai | ai | 97% | OK |
| ai-mountain.jpg | ai | uncertain | 51% | FAIL |
| ai-mountain-thumb.jpg | ai | ai | 97% | OK |
| ai-portrait.jpg | ai | ai | 99% | OK |
| ai-street.jpg | ai | uncertain | 51% | FAIL |
| beach.png | ai | ai | 94% | OK |
| mountain.png | ai | ai | 94% | OK |
| real-beach.jpg | real | uncertain | 51% | FAIL |
| real-cat.jpg | real | ai | 99% | FAIL |
| real-field-people.jpg | real | ai | 99% | FAIL |
| real-food.jpg | real | uncertain | 51% | FAIL |
| real-mountain.jpg | real | real | 1% | OK |
| real-mountain-thumb.jpg | real | uncertain | 73% | FAIL |
| real-portrait.jpg | real | ai | 97% | FAIL |
| real-street.jpg | real | uncertain | 51% | FAIL |

## Misclassifications

- ai-beach.jpg: expected=ai, got=uncertain, AI味=51%
- ai-mountain.jpg: expected=ai, got=uncertain, AI味=51%
- ai-street.jpg: expected=ai, got=uncertain, AI味=51%
- real-beach.jpg: expected=real, got=uncertain, AI味=51%
- real-cat.jpg: expected=real, got=ai, AI味=99%
- real-field-people.jpg: expected=real, got=ai, AI味=99%
- real-food.jpg: expected=real, got=uncertain, AI味=51%
- real-mountain-thumb.jpg: expected=real, got=uncertain, AI味=73%
- real-portrait.jpg: expected=real, got=ai, AI味=97%
- real-street.jpg: expected=real, got=uncertain, AI味=51%
