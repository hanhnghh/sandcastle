---
"@ai-hero/sandcastle": patch
---

A Python traceback now counts as its exception line ("KeyError: 'R4'") for the
repeated-error checkpoint signal. The shared "Traceback (most recent call
last):" header made unrelated script errors look like one repeated failure.
