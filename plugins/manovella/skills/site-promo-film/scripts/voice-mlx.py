"""Says the narrator's lines with a local voice model (mlx-audio), one WAV per line.

    <python> voice-mlx.py <spec.json>

spec: {"model": "<Hugging Face repo>", "voice": "<the model's voice, or null>", "max_tokens": 4000,
       "temperature": null, "lang": null, "lines": [{"out": "<path>.wav", "text": "...", "seed": 1010}, ...]}

Called by voice.mjs, which finds the Python that has mlx-audio (`voice.mjs --setup` makes it, once
on each Mac), decides what needs saying again, and trims, paces and levels the result. The seed is
the take: the same model, voice, text and seed give the same file to the byte on the same Mac and
mlx-audio version, which is how a take chosen by ear is said again.

A line has a ceiling. The models that write speech as tokens stop at `max_tokens`, and mlx-audio's
own default for Orpheus (1200, about 14 s) cut a 19 s sentence off mid-word, with audio that looked
whole and subtitles that went on: measured. So the ceiling is asked for higher (the spec's
`max_tokens`, which voice.mjs sets and keys its recordings by; 4000 is about 48 s of Orpheus; a line under the old ceiling comes out the same to the byte, measured on both models), and
a line that still reaches it stops this instead of being kept: it is two steps.
"""
import inspect
import json
import re
import sys

import mlx.core as mx
import numpy as np

from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model

def kokoro_options(spec, options, accepts):
    """Kokoro: the language it needs beside the voice (lang_code), and the espeak-ng library its non-English text goes through.

    lang_code is spec['lang'] when voice.mjs was given one, else the voice's first letter (Kokoro's own
    naming: a American English, b British, i Italian, ...; no voice is its default, af_heart). The espeak
    library is the one espeakng-loader carries (`voice.mjs --setup kokoro` installs it): misaki looks only
    for a Homebrew one, which is not asked for.
    """
    if 'lang_code' not in accepts:
        return
    voice = spec.get('voice') or 'af_heart'
    options['lang_code'] = spec.get('lang') or voice[0]
    try:
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
    except ImportError:
        sys.exit("voice-mlx.py: Kokoro's text packages are not in this Python: run `node voice.mjs --setup kokoro`")
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())


def kokoro_text(text, lang):
    """A long line in a language mlx-audio does not chunk (espeak's) is cut at its sentences, and a sentence over 300 characters at a comma or a space:
    Kokoro takes 510 phonemes in one go (about 1.1 a character in Italian) and silently drops the rest."""
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
    model = load_model(model_path=spec['model'])
    options = {'voice': spec['voice']} if spec.get('voice') else {}
    limit = int(spec.get('max_tokens') or 4000)
    accepts = inspect.signature(model.generate).parameters
    if 'max_tokens' in accepts:
        options['max_tokens'] = limit
    # a tone (voice.mjs): how freely the model reads; none given is the model's own default, and the take of old
    if spec.get('temperature') is not None and 'temperature' in accepts:
        options['temperature'] = float(spec['temperature'])
    is_kokoro = 'kokoro' in type(model).__module__
    if is_kokoro:
        kokoro_options(spec, options, accepts)
    for line in spec['lines']:
        mx.random.seed(line['seed'])
        text = kokoro_text(line['text'], str(options.get('lang_code', '')).lower()) if is_kokoro else line['text']
        try:
            results = list(model.generate(text=text, verbose=False, **options))
        except ImportError as e:   # misaki, when Kokoro's text packages are missing (it says which)
            sys.exit(f"voice-mlx.py: {e}. For Kokoro, run `node voice.mjs --setup kokoro`")
        chunks = [np.array(r.audio) for r in results]
        if not chunks:
            sys.exit(f"voice-mlx.py: the model gave no audio for: {line['text']}")
        # what a model counts in token_count is its own (Orpheus: the speech it wrote; Chatterbox: the
        # words it read, far under any ceiling), so this catches the one that can be cut short
        if any((getattr(r, 'token_count', 0) or 0) >= limit for r in results):
            sys.exit(f"voice-mlx.py: this line is longer than the model says in one go ({limit} tokens): make it two steps: {line['text']}")
        # Kokoro's token_count is its phonemes a segment, and it stops at 510 without a word: a segment that reaches it was cut
        if is_kokoro and any((getattr(r, 'token_count', 0) or 0) >= 510 for r in results):
            sys.exit(f"voice-mlx.py: this line is longer than Kokoro says in one go (510 phonemes; digits and long words take many): make it two steps: {line['text']}")
        audio_write(line['out'], np.concatenate(chunks), getattr(model, 'sample_rate', 24000), format='wav')
        print(f"said {line['out']}", flush=True)


main()
