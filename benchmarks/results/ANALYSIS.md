# LoCoMo Baseline Analysis

## Testing Setup

**Baselines evaluated:**

- **Full Context (FC)** — the entire conversation history (all sessions, all turns) is concatenated and passed to the LLM alongside the question in a single prompt. No retrieval step; the model sees everything and must find the answer itself.
- **Vector RAG (VR)** — the conversation is split into overlapping 5-turn chunks, each chunk is embedded, and the top-k most similar chunks to the question are retrieved via cosine similarity with MMR diversity reranking. Only the retrieved excerpts (not the full conversation) are passed to the LLM.

**Evaluation pipeline:** For each question, the baseline generates a predicted answer, then a GPT-4o-mini judge compares it against the dataset's expected answer and rules CORRECT or WRONG. Accuracy is the percentage of CORRECT judgments.

**Sampling:** The LoCoMo-10 dataset contains 10 conversations with 1,986 total questions across 5 categories. To keep costs manageable, we use stratified sampling: 30 questions per category (150 total), drawn proportionally across conversations using a seeded RNG for reproducibility.

**Run config:** `--stratified 30 --concurrency 10 --model gpt-4o-mini --seed 42`

## Headline Numbers

| | Full Context | Vector RAG |
|---|---|---|
| **Overall** | **64.0%** [56.7–72.0] | **66.7%** [58.7–73.3] |
| adversarial | 70.0% | 70.0% |
| multi-hop | 86.7% | 86.7% |
| open-domain | 56.7% | 50.0% |
| single-hop | 60.0% | 60.0% |
| temporal | 46.7% | 66.7% |

CIs are 95% bootstrap (1000 resamples). CIs overlap on overall — neither baseline is statistically dominant.

## Agreement Between Baselines

| | Count | % |
|---|---|---|
| Both correct | 80 | 53% |
| Both wrong | 34 | 23% |
| Full Context wrong, Vector RAG right | 20 | 13% |
| Full Context right, Vector RAG wrong | 16 | 11% |

34 questions (23%) are wrong for both baselines — these are the hard questions where MAGMA has the most room to differentiate.

## Category-Level Failure Analysis

### Temporal (Full Context: 47% / Vector RAG: 67%) — MAGMA's biggest opportunity

The 20pp gap between baselines already shows retrieval strategy matters here. Failures stem from:

- **Relative time references**: conversations use "last month", "recently", "the week before" — the LLM sees these but can't resolve them to absolute dates without anchoring to session timestamps
- **Date confusion across sessions**: with 19+ sessions spanning months, the LLM conflates events from different time periods
- **Off-by-one dates**: close but not exact (e.g., "October 22" vs expected "21 October")

**Why MAGMA should win**: The temporal graph stores events with explicit `occurred_at` timestamps. Temporal traversal can resolve relative references by anchoring to session dates, and return precise date facts rather than relying on the LLM to infer them from raw text. Target: **80%+**

### Single-hop (both: 60%) — graph structure prevents incomplete recall

Surprisingly bad for the "easiest" category. Failures are:

- **Incomplete entity recall**: "Oliver and Bailey" when the answer is "Oliver, Luna, Bailey" — facts exist but the LLM drops items from long context
- **Entity confusion**: similar facts about different people/things get mixed up across sessions
- **Fact extraction errors**: the correct information is in the conversation but the LLM retrieves a related-but-wrong fact

**Why MAGMA should win**: Entity graph traversal surfaces all properties of an entity (e.g., all pet names), not just what the LLM's attention happens to land on. Structured retrieval ensures completeness. Target: **75%+**

### Adversarial (both: 70%) — graph boundaries enable refusal

All 30 adversarial questions have empty expected answers — they're trick questions asking about things not in the conversation. When baselines fail, they **hallucinate** plausible answers.

- Full Context hallucinates because it sees so much context that it can construct plausible-sounding answers from tangentially related facts
- Vector RAG hallucinates less but still fabricates when retrieved chunks contain vaguely relevant content

**Why MAGMA should win**: Graph queries that return no matching nodes/edges provide a clear signal that information doesn't exist. The causal and entity graphs can distinguish "mentioned" from "not present" more reliably than text retrieval. Target: **80%+**

### Multi-hop (both: 87%) — already strong, marginal gains

Both baselines handle evidence chaining well. The 13% failure rate involves facts spread across distant sessions where the LLM misses a link in the chain.

**MAGMA opportunity**: Cross-links between graphs (entity→temporal, entity→causal) can surface the full evidence chain. Marginal improvement expected. Target: **90%+**

### Open-domain (Full Context: 57% / Vector RAG: 50%) — partially a judge calibration issue

These are inference/opinion questions ("What traits might Melanie say Caroline has?"). Failures are a mix of:

- **Genuine errors**: wrong state, wrong activity
- **Judge strictness on subjective answers**: the LLM gives a reasonable answer that doesn't match the expected keywords (e.g., "empathetic, inspiring" vs expected "thoughtful, authentic, driven")
- **Inference depth**: some questions require multi-step reasoning that neither baseline prompts for effectively

**MAGMA opportunity**: Semantic graph concepts and causal reasoning can improve inference quality. However, judge strictness on subjective answers creates a ceiling. Target: **60%+** (limited by judge calibration)

## Judge Reliability Notes

~4-5 answers per baseline appear to be **false negatives** (correct answer marked wrong):

- Verbose Vector RAG answers bury the correct answer in chain-of-thought reasoning, and the judge misses it
- Partial matches (2 out of 3 items correct) are marked fully wrong
- Near-miss dates (off by 1 day) are correctly marked wrong — these are genuine errors

Estimated judge error rate: **~3%** of total. Not enough to change the category-level story, but MAGMA evaluation should be aware of this when interpreting close results.

## MAGMA Target Scorecard

| Category | Baseline Best | MAGMA Target | Delta | Key Mechanism |
|---|---|---|---|---|
| temporal | 66.7% | 80%+ | +13pp | Temporal graph with absolute timestamps |
| single-hop | 60.0% | 75%+ | +15pp | Entity graph complete property retrieval |
| adversarial | 70.0% | 80%+ | +10pp | Graph boundary detection (no-match = refusal) |
| multi-hop | 86.7% | 90%+ | +3pp | Cross-graph link traversal |
| open-domain | 56.7% | 60%+ | +3pp | Semantic concepts + causal reasoning |
| **Overall** | **66.7%** | **77%+** | **+10pp** | |

The realistic target is **75–80% overall**, driven by double-digit gains on temporal, single-hop, and adversarial. Open-domain and multi-hop provide marginal uplift.

## Reproducing These Results

```bash
npx dotenv-cli -e .env -- npx tsx benchmarks/src/locomo/run-baselines.ts \
  --stratified 30 --concurrency 10 --seed 42
```

Results are saved incrementally to `baselines.json` after each conversation. The same seed produces identical question samples.
