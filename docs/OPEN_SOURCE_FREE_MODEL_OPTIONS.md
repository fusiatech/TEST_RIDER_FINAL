# Open-Source/Free Model Options (Verified)

Last verified: **February 27, 2026**

## Goal
Provide free-capable model routes for SwarmUI with automatic failover when quota/rate limits are hit.

## Candidate Providers (Official Sources)
1. **Hugging Face Inference Providers**
   - Docs: https://huggingface.co/docs/inference-providers/index
   - Pricing page: https://huggingface.co/pricing
   - Notes: broad open-weight model availability; usage subject to account limits.

2. **GroqCloud**
   - Docs quickstart: https://console.groq.com/docs/quickstart
   - OpenAI-compatible endpoint docs: https://console.groq.com/docs/openai
   - Notes: fast inference for open models; free-tier limits can change.

3. **Together AI**
   - Docs: https://docs.together.ai/docs/introduction
   - Notes: open model catalog; verify free/credit terms per account.

4. **OpenRouter (open-weight aggregation path)**
   - Docs: https://openrouter.ai/docs/quickstart
   - Pricing: https://openrouter.ai/models
   - Notes: multi-provider routing; zero-cost availability varies by model/provider.

## SwarmUI Policy
- `freeOnlyMode=true` restricts routing to provider/model pairs flagged as free-eligible at runtime.
- Automatic switch triggers on:
  - rate-limit errors,
  - quota/credit exhaustion,
  - circuit-breaker open state.
- Switch attempts are bounded by cooldown and max-switch limits.

## Failover Strategy
1. Try highest-priority free cloud provider.
2. On quota/rate failure, switch to next eligible provider.
3. If all cloud options fail and local model is configured, fallback to local provider (e.g., Ollama).
4. Record evidence:
   - previous provider,
   - error type,
   - selected fallback provider,
   - timestamp/trace id.

## Operational Requirement
Before release, re-check links/terms above and update `Last verified` date.
