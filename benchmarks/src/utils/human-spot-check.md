# Human Spot-Check Template

## Stratified Random Sampling

Select **4 questions per LoCoMo category** across **5 categories** = **20 total questions**.

### Categories
1. **Single-hop factual** — Direct fact retrieval from a single conversation
2. **Multi-hop factual** — Requires combining facts across conversations
3. **Temporal reasoning** — Requires understanding time/sequence
4. **Causal reasoning** — Requires understanding cause-effect relationships
5. **Adversarial / unanswerable** — Questions that should be declined or flagged

## Scoring Rubric

Binary scoring to match GPT-4o judge format:

| Score | Criteria |
|-------|----------|
| **CORRECT** | Answer is factually accurate and complete relative to the ground truth |
| **WRONG** | Answer is factually inaccurate, incomplete, or hallucinated |

## Agreement Tracking

| # | Category | Question ID | Human Score | Judge Score | Agreement |
|---|----------|-------------|-------------|-------------|-----------|
| 1 | Single-hop | | | | |
| 2 | Single-hop | | | | |
| 3 | Single-hop | | | | |
| 4 | Single-hop | | | | |
| 5 | Multi-hop | | | | |
| 6 | Multi-hop | | | | |
| 7 | Multi-hop | | | | |
| 8 | Multi-hop | | | | |
| 9 | Temporal | | | | |
| 10 | Temporal | | | | |
| 11 | Temporal | | | | |
| 12 | Temporal | | | | |
| 13 | Causal | | | | |
| 14 | Causal | | | | |
| 15 | Causal | | | | |
| 16 | Causal | | | | |
| 17 | Adversarial | | | | |
| 18 | Adversarial | | | | |
| 19 | Adversarial | | | | |
| 20 | Adversarial | | | | |

## Agreement Target

- **Target:** ≥ 90% agreement between human reviewer and GPT-4o judge
- **Agreement rate:** ___ / 20 = ___%
- **Pass:** YES / NO

## Notes

_Record any observations about systematic disagreements, edge cases, or judge failure modes here._
