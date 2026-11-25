"""Says the narrator's lines with a local voice model on PyTorch, one WAV per line: voice-mlx.py's
work where there is no MLX (Linux, Windows, an Intel Mac), on the CPU or a CUDA GPU.

    <python> voice-torch.py <spec.json>

spec: as voice-mlx.py's: {"model": "<Hugging Face repo>", "voice": "<the model's voice, or null>",
       "max_tokens": 4000, "temperature": null, "lang": null, "lines": [{"out": "<path>.wav", "text": "...", "seed": 1010}, ...]}

Called by voice.mjs, which makes this Python (`voice.mjs --setup kokoro`, once on each machine),
decides what needs saying again, and trims, paces and levels the result.

Kokoro (hexgrad/Kokoro-82M, through the kokoro package: the same voices and the same text pipeline,
misaki, as mlx-audio's) is the model here. It reads without sampling, so the seed changes nothing and
a line comes out the same every time on one machine; a take said here and one said on MLX are the same
voice and words through another engine: heard alike, not equal to the byte.
"""
import json
import re
import sys

import numpy as np
import soundfile as sf
import torch

RATE = 24000   # Kokoro's


def espeak():
    """The espeak-ng library that espeakng-loader carries, for Kokoro's non-English text (misaki looks only for a system one)."""
    try:
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
    except ImportError:
        sys.exit("voice-torch.py: Kokoro's text packages are not in this Python: run `node voice.mjs --setup kokoro`")
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())


def kokoro_text(text, lang):
    """voice-mlx.py's: a long line in a language read through espeak is cut at its sentences, and a sentence over
    300 characters at a comma or a space (Kokoro takes 510 phonemes in one go, about 1.1 a character in Italian)."""
    if lang in ('a', 'b', 'j', 'z', 'en-us', 'en-gb') or len(text) <= 250:
        return text
    pieces = []
    for s in re.split(r'(?<=[.!?…])\s+', text):
        while len(s) > 300:
            i = s.rfind(', ', 150, 300)
            i = i + 1 if i >= 0 else s.rfind(' ', 0, 300)
            i = i if i > 0 else 300
            pieces.append(s[:i].strip())
            s = s[i:].strip()
        pieces.append(s)
    return '\n'.join(pieces)


def main():
    spec = json.load(open(sys.argv[1]))
    if 'kokoro' not in spec['model'].lower():
        sys.exit(f"voice-torch.py: {spec['model']} runs on MLX, an Apple Silicon Mac's; here, Kokoro (\"kokoro\" in the story's \"mlx\")")
    try:
        from kokoro import KPipeline
    except ImportError:
        sys.exit('voice-torch.py: the kokoro package is not in this Python: run `node voice.mjs --setup kokoro`')
    voice = spec.get('voice') or 'af_heart'
    lang = (spec.get('lang') or voice[0]).lower()
    if lang not in ('a', 'b', 'en-us', 'en-gb'):
        espeak()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    pipeline = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M', device=device)
    for line in spec['lines']:
        torch.manual_seed(line['seed'])
        chunks = []
        for r in pipeline(kokoro_text(line['text'], lang), voice=voice, split_pattern=r'\n+'):
            # Kokoro reads 510 phonemes at most and cuts the rest with a warning only: a segment that long was cut
            if r.phonemes and len(r.phonemes) >= 510:
                sys.exit(f"voice-torch.py: this line is longer than Kokoro says in one go (510 phonemes; digits and long words take many): make it two steps: {line['text']}")
            if r.audio is not None:
                chunks.append(r.audio.detach().cpu().numpy())
        if not chunks:
            sys.exit(f"voice-torch.py: the model gave no audio for: {line['text']}")
        sf.write(line['out'], np.concatenate(chunks), RATE, subtype='PCM_16')
        print(f"said {line['out']}", flush=True)


main()
