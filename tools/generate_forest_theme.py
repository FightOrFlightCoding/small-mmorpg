#!/usr/bin/env python3
"""Generate a loopable relaxing-but-lively fantasy forest theme (WAV).

Output: client/assets/audio/music_forest_starter.wav
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 44100
BPM = 102
BEAT_SEC = 60.0 / BPM
BAR_BEATS = 4
BARS = 16
DURATION_SEC = BARS * BAR_BEATS * BEAT_SEC

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "client" / "assets" / "audio" / "music_forest_starter.wav"

# G major palette with gentle modal color (forest folk).
NOTE = {
    "E2": 82.41,
    "G2": 98.0,
    "A2": 110.0,
    "B2": 123.47,
    "C3": 130.81,
    "D3": 146.83,
    "E3": 164.81,
    "F#3": 185.0,
    "G3": 196.0,
    "A3": 220.0,
    "B3": 246.94,
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "G4": 392.0,
    "A4": 440.0,
    "B4": 493.88,
    "D5": 587.33,
    "E5": 659.25,
}

CHORDS = [
    (["G2", "D3", "G3", "B3"], ["G3", "B3", "D4", "G4"]),  # G
    (["G2", "D3", "G3", "B3"], ["G3", "B3", "D4", "G4"]),
    (["E2", "B2", "E3", "G3"], ["E3", "G3", "B3", "E4"]),  # Em
    (["E2", "B2", "E3", "G3"], ["E3", "G3", "B3", "E4"]),
    (["C3", "G3", "C3", "E4"], ["C3", "E3", "G3", "C4"]),  # C (spread voicing)
    (["C3", "G3", "C3", "E4"], ["C3", "E3", "G3", "C4"]),
    (["D3", "A3", "D4", "F#3"], ["D3", "F#3", "A3", "D4"]),  # D
    (["D3", "A3", "D4", "F#3"], ["D3", "F#3", "A3", "D4"]),
    (["G2", "D3", "G3", "B3"], ["G3", "B3", "D4", "G4"]),
    (["G2", "D3", "G3", "B3"], ["G3", "B3", "D4", "G4"]),
    (["A2", "E3", "A3", "C3"], ["A3", "C3", "E4", "A4"]),  # Am
    (["A2", "E3", "A3", "C3"], ["A3", "C3", "E4", "A4"]),
    (["C3", "G3", "E3", "G3"], ["C3", "E3", "G3", "C4"]),
    (["C3", "G3", "E3", "G3"], ["C3", "E3", "G3", "C4"]),
    (["D3", "A3", "D4", "F#3"], ["D3", "F#3", "A3", "D4"]),
    (["D3", "A3", "D4", "F#3"], ["D3", "F#3", "A3", "D4"]),
]

# Pentatonic melody phrases (beat offsets within each 2-bar cell).
MELODY = [
    ("D4", 0.0, 0.9),
    ("E4", 1.0, 0.7),
    ("G4", 2.0, 1.1),
    ("A4", 3.5, 0.8),
    ("G4", 5.0, 0.9),
    ("E4", 6.0, 1.0),
    ("D4", 7.5, 1.2),
    ("B3", 0.5, 0.8),
    ("D4", 2.0, 0.9),
    ("E4", 3.0, 0.7),
    ("G4", 4.5, 1.0),
    ("E4", 6.5, 1.1),
    ("D4", 0.0, 1.0),
    ("G4", 1.5, 0.8),
    ("A4", 3.0, 0.9),
    ("B4", 4.5, 1.0),
    ("A4", 6.0, 0.8),
    ("G4", 7.0, 1.3),
    ("E4", 0.0, 0.9),
    ("G4", 1.5, 0.8),
    ("A4", 3.0, 1.0),
    ("G4", 5.0, 0.9),
    ("E4", 6.5, 1.2),
    ("D4", 0.5, 1.0),
    ("E4", 2.0, 0.8),
    ("G4", 3.5, 1.0),
    ("A4", 5.0, 0.9),
    ("G4", 6.5, 1.4),
    ("D4", 0.0, 0.9),
    ("E4", 1.5, 0.7),
    ("G4", 3.0, 1.1),
    ("B4", 4.5, 0.8),
    ("A4", 6.0, 0.9),
    ("G4", 7.5, 1.5),
]


def t_array() -> np.ndarray:
    n = int(DURATION_SEC * SAMPLE_RATE)
    return np.arange(n, dtype=np.float64) / SAMPLE_RATE


def adsr(
    length: int,
    attack: float = 0.02,
    decay: float = 0.08,
    sustain: float = 0.65,
    release: float = 0.25,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    env = np.zeros(length, dtype=np.float64)
    a = int(attack * sample_rate)
    d = int(decay * sample_rate)
    r = int(release * sample_rate)
    s_len = max(0, length - a - d - r)
    idx = 0
    if a > 0:
        env[idx : idx + a] = np.linspace(0.0, 1.0, a, endpoint=False)
        idx += a
    if d > 0:
        env[idx : idx + d] = np.linspace(1.0, sustain, d, endpoint=False)
        idx += d
    if s_len > 0:
        env[idx : idx + s_len] = sustain
        idx += s_len
    if r > 0 and idx < length:
        env[idx:] = np.linspace(sustain, 0.0, length - idx, endpoint=True)
    return env


def mix_track(buffer: np.ndarray, start_sec: float, signal: np.ndarray, gain: float = 1.0) -> None:
    start = int(start_sec * SAMPLE_RATE)
    end = start + len(signal)
    if start >= len(buffer):
        return
    if end > len(buffer):
        signal = signal[: len(buffer) - start]
        end = len(buffer)
    buffer[start:end] += signal * gain


def sine(freq: float, length: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    return np.sin(2.0 * math.pi * freq * t + phase)


def pluck(freq: float, duration: float, brightness: float = 0.35) -> np.ndarray:
    length = max(1, int(duration * SAMPLE_RATE))
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    tone = np.sin(2.0 * math.pi * freq * t)
    tone += brightness * np.sin(2.0 * math.pi * freq * 2.0 * t)
    tone += (brightness * 0.35) * np.sin(2.0 * math.pi * freq * 3.0 * t)
    env = np.exp(-t * (4.5 + freq / 220.0))
    return tone * env * adsr(length, 0.001, 0.05, 0.4, min(0.35, duration * 0.45))


def pad_voice(freq: float, duration: float) -> np.ndarray:
    length = max(1, int(duration * SAMPLE_RATE))
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    vibrato = 1.0 + 0.003 * np.sin(2.0 * math.pi * 4.5 * t)
    v1 = np.sin(2.0 * math.pi * freq * vibrato * t)
    v2 = np.sin(2.0 * math.pi * (freq * 1.005) * t + 0.4)
    v3 = np.sin(2.0 * math.pi * (freq * 0.995) * t + 1.1)
    env = adsr(length, 0.8, 0.4, 0.55, 1.2)
    return (v1 * 0.55 + v2 * 0.25 + v3 * 0.2) * env


def flute(freq: float, duration: float) -> np.ndarray:
    length = max(1, int(duration * SAMPLE_RATE))
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    vibrato = 1.0 + 0.012 * np.sin(2.0 * math.pi * 5.2 * t)
    body = np.sin(2.0 * math.pi * freq * vibrato * t)
    body += 0.18 * np.sin(2.0 * math.pi * freq * 2.0 * t)
    breath = np.random.default_rng(int(freq * 100)).normal(0.0, 1.0, length)
    breath = np.convolve(breath, np.ones(80) / 80.0, mode="same")
    env = adsr(length, 0.08, 0.12, 0.72, min(0.45, duration * 0.35))
    return body * env * 0.85 + breath * env * 0.04


def soft_kick(start_sec: float, buffer: np.ndarray) -> None:
    length = int(0.22 * SAMPLE_RATE)
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    pitch = np.linspace(95.0, 42.0, length)
    phase = np.cumsum(2.0 * math.pi * pitch / SAMPLE_RATE)
    body = np.sin(phase) * np.exp(-t * 18.0)
    mix_track(buffer, start_sec, body, 0.22)


def shaker(start_sec: float, duration: float, buffer: np.ndarray, gain: float = 0.05) -> None:
    length = max(1, int(duration * SAMPLE_RATE))
    rng = np.random.default_rng(int(start_sec * 1000))
    noise = rng.normal(0.0, 1.0, length)
    noise = np.convolve(noise, np.ones(40) / 40.0, mode="same")
    env = adsr(length, 0.01, 0.08, 0.35, min(0.12, duration * 0.4))
    mix_track(buffer, start_sec, noise * env, gain)


def wood_block(start_sec: float, buffer: np.ndarray) -> None:
    signal = pluck(880.0, 0.08, brightness=0.15)
    mix_track(buffer, start_sec, signal, 0.09)


def bird_chirp(start_sec: float, freq: float, buffer: np.ndarray) -> None:
    length = int(0.18 * SAMPLE_RATE)
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    glide = freq + (freq * 0.35) * (t / t[-1])
    phase = np.cumsum(2.0 * math.pi * glide / SAMPLE_RATE)
    chirp = np.sin(phase) * np.exp(-t * 14.0)
    mix_track(buffer, start_sec, chirp, 0.035)


def build() -> np.ndarray:
    t = t_array()
    mix = np.zeros_like(t)

    bar_sec = BAR_BEATS * BEAT_SEC

    # Warm wind bed.
    wind_rng = np.random.default_rng(7)
    wind = wind_rng.normal(0.0, 1.0, len(t))
    wind = np.convolve(wind, np.ones(900) / 900.0, mode="same")
    wind *= 0.012 + 0.006 * (0.5 + 0.5 * np.sin(2.0 * math.pi * 0.06 * t))
    mix += wind

    for bar_idx, (bass_notes, pad_notes) in enumerate(CHORDS):
        bar_start = bar_idx * bar_sec

        # Pad — whole bar, soft and airy.
        for note in pad_notes:
            mix_track(mix, bar_start, pad_voice(NOTE[note], bar_sec * 0.98), 0.07)

        # Bass — gentle root pulse on beats 1 and 3.
        root = bass_notes[0]
        for beat in (0.0, 2.0):
            mix_track(mix, bar_start + beat * BEAT_SEC, pluck(NOTE[root], BEAT_SEC * 1.6, 0.08), 0.16)

        # Harp arpeggio — lively 8th-note pattern.
        arp_pattern = pad_notes + [pad_notes[1], pad_notes[0]]
        step = BEAT_SEC / 2.0
        for i, note in enumerate(arp_pattern * 4):
            at = bar_start + i * step
            mix_track(mix, at, pluck(NOTE[note], 0.55, 0.28), 0.11)

        # Light percussion.
        soft_kick(bar_start, mix)
        soft_kick(bar_start + 2.0 * BEAT_SEC, mix)
        for eighth in range(8):
            if eighth % 2 == 1:
                shaker(bar_start + eighth * step, step * 0.9, mix, 0.042)
        if bar_idx % 4 == 2:
            wood_block(bar_start + 3.0 * BEAT_SEC, mix)

    # Melody — flute phrases every 2 bars.
    for phrase_idx in range(0, len(MELODY), 7):
        phrase_bar = (phrase_idx // 7) * 2
        phrase_start = phrase_bar * bar_sec
        for note_name, beat_offset, dur in MELODY[phrase_idx : phrase_idx + 7]:
            mix_track(
                mix,
                phrase_start + beat_offset * BEAT_SEC,
                flute(NOTE[note_name], dur),
                0.19,
            )

    # Occasional forest birds for sparkle.
    bird_times = [3.5, 11.0, 19.5, 28.0, 36.5, 44.0, 52.0, 60.0]
    bird_freqs = [1760.0, 1560.0, 1980.0, 1660.0, 1880.0, 1720.0, 2040.0, 1600.0]
    for at, freq in zip(bird_times, bird_freqs):
        if at < DURATION_SEC:
            bird_chirp(at, freq, mix)

    # Seamless loop crossfade (last 0.4s fades into first 0.4s conceptually).
    fade_samples = int(0.35 * SAMPLE_RATE)
    fade_in = np.linspace(0.0, 1.0, fade_samples)
    fade_out = fade_in[::-1]
    mix[:fade_samples] *= fade_in
    mix[-fade_samples:] *= fade_out

    # Gentle master compression / normalize.
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix *= 0.92 / peak

    # Soft low-pass via simple averaging (warmth).
    kernel = np.ones(3) / 3.0
    mix = np.convolve(mix, kernel, mode="same")

    return mix


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def main() -> None:
    print(f"Generating {DURATION_SEC:.1f}s forest theme @ {BPM} BPM ...")
    samples = build()
    write_wav(OUT_PATH, samples)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
