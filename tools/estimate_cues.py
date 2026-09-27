"""Estimate voiceover cue times for the LlamaParse sponsor read.

Prints phrase start/end times and the relative position (0-1) of key words
inside each phrase, assuming a steady speaking rate. Paste the output into
src/cues.js, or better: replace the numbers there with times measured from
the real voiceover recording.

    python3 tools/estimate_cues.py [syllables_per_second]
"""
import re
import sys

RATE = float(sys.argv[1]) if len(sys.argv) > 1 else 4.3  # ~170 wpm sponsor read
LEAD_IN = 0.35

# (id, words as spoken, pause after, key words to mark)
PHRASES = [
    ("interrupt", "Quick interruption from my future self", 0.12, ["future"]),
    ("sponsor", "to present you a very nice sponsor for this video", 0.12, ["present", "sponsor"]),
    ("podcast", "and one that I had on the podcast a few years ago", 0.10, ["podcast", "years"]),
    ("llamaindex", "Lama Index", 0.40, []),
    ("rag", "Yes the very same rag framework", 0.08, ["rag"]),
    ("jerry", "where I had Jerry Liu the founder on my podcast in twenty twenty three", 0.40,
     ["Jerry", "founder", "podcast", "twenty"]),
    ("except", "Except now it's all about Lama Parse", 0.08, ["Lama"]),
    ("ocr", "their agentic O C R", 0.40, ["agentic"]),
    ("episode", "In the episode I recorded with Jerry", 0.12, ["Jerry"]),
    ("pdfs", "I told him that P D Fs would remain a problem for a very long time", 0.15,
     ["P", "problem", "long"]),
    ("pipeline", "and now they built the most powerful O C R pipeline I've ever seen", 0.60,
     ["powerful", "pipeline"]),
    ("personal", "I guess they might have took that a bit personally", 0.40, ["personally"]),
    ("route", "Lama Parse sends tables charts and scans to the right model", 0.08,
     ["tables", "charts", "scans", "right"]),
    ("trace", "and then traces every value back to its source", 0.40, ["every", "source"]),
    ("bench", "On their open benchmark", 0.08, ["benchmark"]),
    ("top", "it comes out on top for a fraction of the cost", 0.40, ["top", "fraction"]),
    ("code", "Use the code summer gift twenty six", 0.08, ["summer"]),
    ("credits", "for two hundred fifty dollars in free credits", 0.10, ["two", "free"]),
    ("half", "and half off your first three months of subscription", 0.08, ["half", "three"]),
    ("upgrade", "if you upgrade within thirty days", 0.60, ["upgrade", "thirty"]),
    ("link", "Check out Lama Parse with the first link in the description below", 0.12,
     ["first", "description", "below"]),
    ("team", "and go support my friend Jerry Liu and his amazing team", 0.40,
     ["friend", "Jerry", "amazing"]),
    ("october", "The offer stands for the whole October month", 0.40, ["whole", "October"]),
    ("back", "Now let's get back to the video", 0.30, ["back"]),
]

SYLLABLES = {
    "o": 1, "c": 1, "r": 1, "p": 1, "d": 1, "fs": 1, "lama": 2, "liu": 1, "jerry": 2,
    "agentic": 3, "i've": 1, "it's": 1, "let's": 1, "rag": 1, "video": 3, "every": 3,
    "personally": 4, "interruption": 4, "subscription": 3, "description": 3,
    "benchmark": 2, "framework": 2, "october": 3, "episode": 3, "recorded": 3,
    "powerful": 3, "pipeline": 2, "value": 2, "source": 1, "upgrade": 2, "ever": 2,
    "twenty": 2, "hundred": 2, "fifty": 2, "dollars": 2, "amazing": 3, "ago": 2,
}


def syllables(word):
    w = word.lower()
    if w in SYLLABLES:
        return SYLLABLES[w]
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and n > 1:
        n -= 1
    return max(1, n)


def main():
    t = LEAD_IN
    words_total = 0
    print(f"// speaking rate {RATE} syllables/s")
    for pid, text, pause, marks in PHRASES:
        words = text.split()
        words_total += len(words)
        syl = [syllables(w) for w in words]
        dur = sum(syl) / RATE
        found = {}
        acc = 0
        for w, s in zip(words, syl):
            if w in marks and w not in found:
                found[w] = acc / sum(syl)
            acc += s
        mark_str = ", ".join(f"{k}: {v:.2f}" for k, v in found.items())
        print(f"{{ id: '{pid}', start: {t:.2f}, end: {t + dur:.2f}, marks: {{ {mark_str} }} }},")
        t += dur + pause
    print(f"// total {t:.2f}s, {words_total} words, {words_total / (t / 60):.0f} wpm")


if __name__ == "__main__":
    main()
