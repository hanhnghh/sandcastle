---
"@ai-hero/sandcastle": patch
---

Codex failures now name the stream error (for example "Selected model is at
capacity") even when stderr only logs progress, so an overloaded model is
classified as a provider failure and retried instead of counting as a task
failure.
