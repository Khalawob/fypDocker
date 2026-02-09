from flask import Flask, request, jsonify
import spacy
import random
import re

app = Flask(__name__)
nlp = spacy.load("en_core_web_sm")


def is_word(token_text: str) -> bool:
    return bool(re.match(r"^[A-Za-z]+$", token_text))


def eligible_token(t) -> bool:
    # Blankable words:
    # - alphabetic only
    # - not stopwords (and/or/the etc.)
    # - length >= 4 (your requirement)
    return is_word(t.text) and (not t.is_stop) and len(t.text) >= 4


@app.post("/generate")
def generate():
    data = request.get_json(force=True)

    text = data.get("text", "")
    variation_type = data.get("variation_type", "ALL_BLANK_FIRST_LETTERS")

    # Used by RANDOM_BLANKS
    blank_ratio = data.get("blank_ratio", None)

    # Used for reproducible randomness (optional)
    seed = data.get("seed", None)

    # Used by INCREASING_DIFFICULTY
    attempt_number = int(data.get("attempt_number", 1))
    base_blank_ratio = float(data.get("base_blank_ratio", 0.30))
    step = float(data.get("step", 0.15))
    max_blank_ratio = float(data.get("max_blank_ratio", 0.85))

    # Used by DIFFICULTY_LEVEL_BLANKS
    difficulty_level = int(data.get("difficulty_level", 1))

    if not text.strip():
        return jsonify({"error": "text is required"}), 400

    if seed is not None:
        random.seed(seed)

    doc = nlp(text)

    # Eligible candidates to blank
    candidates = [t for t in doc if eligible_token(t)]
    blank_set = set()

    # ----------------------------
    # 1) ALL_BLANK_FIRST_LETTERS
    # ----------------------------
    if variation_type == "ALL_BLANK_FIRST_LETTERS":
        blank_set = set(candidates)

    # ----------------------------
    # 2) RANDOM_BLANKS
    # ----------------------------
    elif variation_type == "RANDOM_BLANKS":
        ratio = float(blank_ratio) if blank_ratio is not None else 0.40
        ratio = max(0.0, min(1.0, ratio))

        if not candidates:
            blank_set = set()
        else:
            k = max(1, int(len(candidates) * ratio))
            blank_set = set(random.sample(candidates, min(k, len(candidates))))

    # ----------------------------
    # 3) KEY_TERMS_ONLY
    # Blank nouns / proper nouns and named entities (if eligible)
    # ----------------------------
    elif variation_type == "KEY_TERMS_ONLY":
        key_terms = []
        for t in doc:
            if not eligible_token(t):
                continue

            if t.pos_ in ("NOUN", "PROPN") or t.ent_type_:
                key_terms.append(t)

        blank_set = set(key_terms)

    # ----------------------------
    # 4) EVERY_OTHER_WORD
    # Deterministic pattern: blank every other eligible word
    # ----------------------------
    elif variation_type == "EVERY_OTHER_WORD":
        blank_set = set(candidates[::2])

    # ----------------------------
    # 5) INCREASING_DIFFICULTY
    # More blanks each attempt (ratio increases), capped at max_blank_ratio
    # ----------------------------
    elif variation_type == "INCREASING_DIFFICULTY":
        if blank_ratio is not None:
            ratio = float(blank_ratio)
        else:
            ratio = base_blank_ratio + step * (attempt_number - 1)

        ratio = max(0.0, min(max_blank_ratio, ratio))

        if not candidates:
            blank_set = set()
        else:
            if ratio >= 1.0:
                blank_set = set(candidates)
            else:
                k = max(1, int(len(candidates) * ratio))
                blank_set = set(random.sample(candidates, min(k, len(candidates))))

    # ----------------------------
    # 6) DIFFICULTY_LEVEL_BLANKS (NEW)
    # Level 1: 25%, Level 2: 50%, Level 3: 75%, Level 4: 100%
    # ----------------------------
    elif variation_type == "DIFFICULTY_LEVEL_BLANKS":
        level_to_ratio = {1: 0.25, 2: 0.50, 3: 0.75, 4: 1.00}
        ratio = level_to_ratio.get(difficulty_level, 0.25)

        if not candidates:
            blank_set = set()
        else:
            if ratio >= 1.0:
                blank_set = set(candidates)
            else:
                k = max(1, int(len(candidates) * ratio))
                blank_set = set(random.sample(candidates, min(k, len(candidates))))

    else:
        return jsonify({"error": f"Unknown variation_type: {variation_type}"}), 400

    # Build outputs preserving punctuation + whitespace
    out_tokens = []
    clue_tokens = []

    for t in doc:
        if t in blank_set:
            first = t.text[0]
            blanked = first + "_" * (len(t.text) - 1)
            out_tokens.append(blanked)
            clue_tokens.append(first)
        else:
            out_tokens.append(t.text)
            clue_tokens.append(t.text)

        if t.whitespace_:
            out_tokens.append(t.whitespace_)
            clue_tokens.append(t.whitespace_)

    blanked_text = "".join(out_tokens).strip()
    first_letter_clues = "".join(clue_tokens).strip()

    return jsonify({
        "blanked_text": blanked_text,
        "first_letter_clues": first_letter_clues
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000)

