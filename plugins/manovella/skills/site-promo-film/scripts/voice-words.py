"""voice-words.py: the words a recording says, each with the second it starts and ends.

Run by words.mjs, never by hand: `python voice-words.py spec.json`, where spec.json is
  { "engine": "mlx" | "torch", "model": <repo>, "out": <file>,
    "lines": [ { "wav": <16 kHz mono WAV>, "lang": "en" | null, "text": <what the story says> } ] }
and `out` receives [ { "text": <what it heard>, "words": [ { "w", "t0", "t1" } ] } ] a line, in seconds from the
recording's first sample.

Speech to text, Whisper (MIT), word times from its cross-attention and dynamic time warping, the
method both engines share: on an Apple Silicon Mac through mlx-audio (MLX, the venv voice.mjs --setup makes),
elsewhere through PyTorch and Transformers (CPU, venv-torch). The text the story says is NOT given to the model
(words.mjs matches it to what was heard, letter by letter): a recording that says something else is seen as such.
"""
import json
import subprocess
import sys

spec = json.load(open(sys.argv[1]))
engine, repo, lines = spec["engine"], spec["model"], spec["lines"]
result = []

if engine == "mlx":
    from mlx_audio.stt.utils import load_model

    model = load_model(repo)
    for line in lines:
        r = model.generate(line["wav"], word_timestamps=True, language=line.get("lang"), verbose=None)
        words = [{"w": w["word"].strip(), "t0": float(w["start"]), "t1": float(w["end"])}
                 for s in (r.segments or []) for w in s.get("words", [])]
        result.append({"text": r.text.strip(), "words": words})
else:
    import numpy as np
    import torch
    from transformers import pipeline

    pipe = pipeline("automatic-speech-recognition", model=repo, device="cpu", dtype=torch.float32)
    for line in lines:
        # 16 kHz mono floats, the way Whisper reads: words.mjs wrote the WAV at that rate
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", line["wav"], "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                             capture_output=True, check=True).stdout
        kw = {"task": "transcribe"}
        if line.get("lang"):
            kw["language"] = line["lang"]
        r = pipe({"raw": np.frombuffer(raw, dtype=np.float32), "sampling_rate": 16000}, return_timestamps="word", generate_kwargs=kw)
        words = [{"w": c["text"].strip(), "t0": float(c["timestamp"][0]), "t1": float(c["timestamp"][1] if c["timestamp"][1] is not None else c["timestamp"][0])}
                 for c in r["chunks"]]
        result.append({"text": r["text"].strip(), "words": words})

json.dump(result, open(spec["out"], "w"), indent=1)
