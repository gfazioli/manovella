"""Says the narrator's lines with a local voice model on PyTorch, one WAV per line: voice-mlx.py's
work where there is no MLX (Linux, Windows, an Intel Mac), on the CPU or a CUDA GPU.

    <python> voice-torch.py <spec.json>

spec: as voice-mlx.py's: {"model": "<Hugging Face repo>", "voice": "<the model's voice, or null>",
       "max_tokens": 4000, "temperature": null, "lang": null, "lines": [{"out": "<path>.wav", "text": "...", "seed": 1010}, ...]}

Called by voice.mjs, which makes this Python (`voice.mjs --setup kokoro`, once on each machine),
decides what needs saying again, and trims, paces and levels the result.

The models, by the Hugging Face repo voice.mjs names (its MLX ones' PyTorch weights):
- Kokoro (hexgrad/Kokoro-82M, through the kokoro package: the same voices and text pipeline, misaki,
  as mlx-audio's). It reads without sampling, so the seed changes nothing. Light: the CPU says it.
- Chatterbox Turbo (ResembleAI/chatterbox-turbo, through chatterbox-tts) and Orpheus
  (unsloth/orpheus-3b-0.1-ft: Canopy Labs' weights, Apache 2.0, without the login the original's page
  asks for; read with transformers and decoded by SNAC, as Canopy's own code does). They sample: the
  seed is the take, on one machine and engine. A CUDA GPU says them; the CPU does, slowly.
A take said here and one said on MLX are the same voice and words through another engine: heard
alike, not equal to the byte.
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


def write(out, audio, rate):
    sf.write(out, np.asarray(audio, dtype=np.float32), rate, subtype='PCM_16')
    print(f"said {out}", flush=True)


def seed(n):
    torch.manual_seed(n)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(n)


def chatterbox(spec, device):
    try:
        from chatterbox.tts_turbo import ChatterboxTurboTTS
    except ImportError:
        sys.exit('voice-torch.py: chatterbox-tts is not in this Python: run `node voice.mjs --setup chatterbox`')
    model = ChatterboxTurboTTS.from_pretrained(device)
    temperature = spec['temperature'] if spec.get('temperature') is not None else 0.8   # its own default
    for line in spec['lines']:
        seed(line['seed'])
        with torch.inference_mode():
            wav = model.generate(line['text'], temperature=temperature)
        write(line['out'], wav.squeeze().float().cpu().numpy(), model.sr)


def orpheus(spec, device):
    try:
        from snac import SNAC
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError:
        sys.exit('voice-torch.py: Orpheus\'s packages are not in this Python: run `node voice.mjs --setup orpheus`')
    tokenizer = AutoTokenizer.from_pretrained(spec['model'])
    model = AutoModelForCausalLM.from_pretrained(spec['model'], torch_dtype=torch.bfloat16 if device == 'cuda' else torch.float32).to(device).eval()
    snac = SNAC.from_pretrained('hubertsiuzdak/snac_24khz').eval().to(device)
    voice, limit = spec.get('voice') or 'leah', int(spec.get('max_tokens') or 4000)
    temperature = spec['temperature'] if spec.get('temperature') is not None else 0.6   # Canopy's default
    for line in spec['lines']:
        seed(line['seed'])
        # Canopy's framing: start of human, the prompt "<voice>: <text>", end of text and of human
        ids = tokenizer(f"{voice}: {line['text']}", return_tensors='pt').input_ids
        ids = torch.cat([torch.tensor([[128259]]), ids, torch.tensor([[128009, 128260]])], dim=1).to(device)
        with torch.inference_mode():
            out = model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), max_new_tokens=limit, do_sample=True,
                                 temperature=temperature, top_p=0.95, repetition_penalty=1.1, eos_token_id=128258)
        new = out[0, ids.shape[1]:]
        if len(new) >= limit:
            sys.exit(f"voice-torch.py: this line is longer than the model says in one go ({limit} tokens): make it two steps: {line['text']}")
        starts = (new == 128257).nonzero()   # start of speech; its codes follow, 7 a frame, until the end of speech
        codes = new[starts[-1].item() + 1:] if len(starts) else new
        codes = [int(t) - 128266 for t in codes[codes != 128258]]
        codes = codes[:len(codes) // 7 * 7]
        if not codes:
            sys.exit(f"voice-torch.py: the model gave no audio for: {line['text']}")
        layers = ([], [], [])   # SNAC's three: a frame's 7 codes are 1 + 2 + 4 of them, each offset by its slot
        for i in range(0, len(codes), 7):
            c = codes[i:i + 7]
            layers[0].append(c[0])
            layers[1].extend([c[1] - 4096, c[4] - 4 * 4096])
            layers[2].extend([c[2] - 2 * 4096, c[3] - 3 * 4096, c[5] - 5 * 4096, c[6] - 6 * 4096])
        with torch.inference_mode():
            audio = snac.decode([torch.tensor(layer).unsqueeze(0).to(device) for layer in layers])
        write(line['out'], audio.squeeze().float().cpu().numpy(), 24000)


def main():
    spec = json.load(open(sys.argv[1]))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    name = spec['model'].lower()
    if 'chatterbox' in name:
        return chatterbox(spec, device)
    if 'orpheus' in name:
        return orpheus(spec, device)
    try:
        from kokoro import KPipeline
    except ImportError:
        sys.exit('voice-torch.py: the kokoro package is not in this Python: run `node voice.mjs --setup kokoro`')
    voice = spec.get('voice') or 'af_heart'
    lang = (spec.get('lang') or voice[0]).lower()
    if lang not in ('a', 'b', 'en-us', 'en-gb'):
        espeak()
    pipeline = KPipeline(lang_code=lang, repo_id=spec['model'], device=device)
    for line in spec['lines']:
        seed(line['seed'])
        chunks = []
        for r in pipeline(kokoro_text(line['text'], lang), voice=voice, split_pattern=r'\n+'):
            # Kokoro reads 510 phonemes at most and cuts the rest with a warning only: a segment that long was cut
            if r.phonemes and len(r.phonemes) >= 510:
                sys.exit(f"voice-torch.py: this line is longer than Kokoro says in one go (510 phonemes; digits and long words take many): make it two steps: {line['text']}")
            if r.audio is not None:
                chunks.append(r.audio.detach().cpu().numpy())
        if not chunks:
            sys.exit(f"voice-torch.py: the model gave no audio for: {line['text']}")
        write(line['out'], np.concatenate(chunks), RATE)


main()
