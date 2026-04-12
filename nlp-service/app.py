from flask import Flask, request, jsonify
import spacy
import random
import re
import os

app = Flask(__name__)
nlp = spacy.load("en_core_web_sm")


def is_word(token_text: str) -> bool:
    return bool(re.match(r"^[A-Za-z]+$", token_text))


def eligible_token(t) -> bool:
    return is_word(t.text) and (not t.is_stop) and len(t.text) >= 4


def normalize_blank_style(blank_style: str) -> str:
    value = str(blank_style or "FIRST_LETTER").strip().upper()
    if value not in {"FIRST_LETTER", "FULL"}:
        return "FIRST_LETTER"
    return value


@app.post("/generate")
def generate():
    data = request.get_json(force=True)

    text = data.get("text", "")
    variation_type = str(data.get("variation_type", "ALL_BLANKS")).strip().upper()
    blank_style = normalize_blank_style(data.get("blank_style", "FIRST_LETTER"))

    blank_ratio = data.get("blank_ratio", None)
    seed = data.get("seed", None)

    attempt_number = int(data.get("attempt_number", 1))
    base_blank_ratio = float(data.get("base_blank_ratio", 0.30))
    step = float(data.get("step", 0.15))
    max_blank_ratio = float(data.get("max_blank_ratio", 0.85))

    difficulty_level = int(data.get("difficulty_level", 1))

    if not text.strip():
        return jsonify({"error": "text is required"}), 400

    if seed is not None:
        random.seed(seed)

    doc = nlp(text)
    candidates = [t for t in doc if eligible_token(t)]
    blank_set = set()

    # blank_style now controls rendering only
    blank_with_first_letter = blank_style == "FIRST_LETTER"

    # ----------------------------
    # ALL_BLANKS
    # Blank all eligible words
    # ----------------------------
    if variation_type == "ALL_BLANKS":
        blank_set = set(candidates)

    # ----------------------------
    # RANDOM_BLANKS
    # Blank a percentage of eligible words
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
    # KEY_TERMS_ONLY
    # Blank nouns / proper nouns / entities
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
    # EVERY_OTHER_WORD
    # Blank every other eligible word
    # ----------------------------
    elif variation_type == "EVERY_OTHER_WORD":
        blank_set = set(candidates[::2])

    # ----------------------------
    # INCREASING_DIFFICULTY
    # More blanks each attempt
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
    # DIFFICULTY_LEVEL_BLANKS
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

    out_tokens = []
    clue_tokens = []

    for t in doc:
        if t in blank_set:
            if blank_with_first_letter:
                first = t.text[0]
                blanked = first + "_" * (len(t.text) - 1)
                out_tokens.append(blanked)
                clue_tokens.append(first)
            else:
                blanked = "_" * len(t.text)
                out_tokens.append(blanked)
                clue_tokens.append("")
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
        "first_letter_clues": first_letter_clues if blank_with_first_letter else ""
    })


BAD_TERMS = {
    "what", "which", "who", "where", "when", "why", "how",
    "this", "that", "these", "those",
    "it", "they", "them", "he", "she", "we", "you",
    "something", "anything", "someone", "somebody"
}

MAX_SENTENCE_WORDS = 30
MIN_SENTENCE_WORDS = 5
MAX_ANSWER_WORDS = 20
MIN_ANSWER_WORDS = 1


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text


def normalize_term(term: str) -> str:
    term = clean_text(term)
    term = re.sub(r"^the\s+", "", term, flags=re.IGNORECASE)
    return term.strip()


def is_bad_term(term: str) -> bool:
    t = term.strip().lower()
    if not t:
        return True
    if t in BAD_TERMS:
        return True
    if len(t) < 2:
        return True
    words = t.split()
    if all(w in BAD_TERMS for w in words):
        return True
    return False


def valid_sentence(sent_text: str) -> bool:
    words = sent_text.split()
    if len(words) < MIN_SENTENCE_WORDS or len(words) > MAX_SENTENCE_WORDS:
        return False

    lower = sent_text.strip().lower()

    if lower.endswith("?"):
        return False

    if lower.startswith(("this ", "that ", "these ", "those ", "it ", "they ")):
        return False

    return True


def extract_subject_phrase(sent):
    root = None
    for token in sent:
        if token.dep_ == "ROOT":
            root = token
            break

    if not root:
        return None

    subjects = [t for t in sent if t.dep_ in ("nsubj", "nsubjpass", "attr")]
    if not subjects:
        return None

    subj = subjects[0]
    subtree = list(subj.subtree)
    subtree = sorted(subtree, key=lambda x: x.i)
    phrase = clean_text(" ".join(tok.text for tok in subtree))
    phrase = normalize_term(phrase)

    if is_bad_term(phrase):
        return None

    return phrase


def shorten_answer(text: str, keep_that_clause: bool = False) -> str:
    text = clean_text(text)

    if keep_that_clause:
        split_pattern = r"\b(because|which|who|where|when|although|since)\b"
    else:
        split_pattern = r"\b(because|which|that|who|where|when|although|since)\b"

    parts = re.split(split_pattern, text, maxsplit=1, flags=re.IGNORECASE)
    if parts:
        text = parts[0].strip(" ,;:-")

    text = re.split(r"[;:]", text)[0].strip()

    if text.lower().startswith("responsible for "):
        text = "the part responsible for " + text[len("responsible for "):]

    words = text.split()
    if len(words) > MAX_ANSWER_WORDS:
        text = " ".join(words[:MAX_ANSWER_WORDS]).strip()

    text = clean_text(text)
    text = text.strip(" .,:;!-")
    return text


def answer_word_count_ok(answer: str) -> bool:
    wc = len(answer.split())
    return MIN_ANSWER_WORDS <= wc <= MAX_ANSWER_WORDS


def question_is_valid(question: str) -> bool:
    q = question.strip().lower()
    bad_patterns = [
        "what is what",
        "what are what",
        "what is this",
        "what is that",
        "what are these",
        "what are those"
    ]
    return q not in bad_patterns


def dedupe_cards(cards):
    seen = set()
    unique = []
    for card in cards:
        key = (
            card["question"].strip().lower(),
            card["answer"].strip().lower()
        )
        if key not in seen:
            seen.add(key)
            unique.append(card)
    return unique


def try_abbreviation_card(sent):
    text = clean_text(sent.text)
    match = re.match(r"(.+?)\s+stands for\s+(.+)", text, re.IGNORECASE)
    if not match:
        return None

    term = normalize_term(match.group(1))
    answer = clean_text(match.group(2)).strip(" .,:;!-")

    if is_bad_term(term):
        return None
    if not answer_word_count_ok(answer):
        return None

    question = f"What does {term} stand for?"

    if not question_is_valid(question):
        return None

    return {
        "question": clean_text(question),
        "answer": answer
    }


def try_usage_card(sent):
    text = clean_text(sent.text)

    match = re.match(r"(.+?)\s+is used (to|for)\s+(.+)", text, re.IGNORECASE)
    if not match:
        return None

    term = normalize_term(match.group(1))
    usage_type = match.group(2).lower()
    usage_text = clean_text(match.group(3))

    if is_bad_term(term):
        return None

    if usage_type == "to":
        answer = shorten_answer(f"to {usage_text}")
    else:
        answer = shorten_answer(usage_text)

    if not answer_word_count_ok(answer):
        return None

    question = f"What is {term} used for?"

    if not question_is_valid(question):
        return None

    return {
        "question": clean_text(question),
        "answer": answer
    }


def try_definition_card(sent):
    root = None
    for token in sent:
        if token.dep_ == "ROOT":
            root = token
            break

    if not root:
        return None

    subject = extract_subject_phrase(sent)
    if not subject:
        return None

    subject = normalize_term(subject)
    root_lemma = root.lemma_.lower()

    if root_lemma not in {"be", "refer", "mean"}:
        return None

    answer_tokens = [t for t in sent if t.i > root.i]
    if not answer_tokens:
        return None

    answer = clean_text(" ".join(t.text for t in answer_tokens))
    answer = shorten_answer(answer, keep_that_clause=True)

    if not answer_word_count_ok(answer):
        return None

    if root_lemma == "be":
        if root.tag_ in {"VBP", "VB"} and subject.lower().endswith("s"):
            question = f"What are {subject}?"
        else:
            question = f"What is {subject}?"
    elif root_lemma == "refer":
        question = f"What does {subject} refer to?"
    else:
        question = f"What does {subject} mean?"

    if is_bad_term(subject):
        return None

    if not question_is_valid(question):
        return None

    return {
        "question": clean_text(question),
        "answer": answer
    }


def try_purpose_card(sent):
    text = clean_text(sent.text)
    lower = text.lower()

    match = re.match(r"the (function|purpose|role) of (.+?) is (.+)", lower, re.IGNORECASE)
    if not match:
        return None

    label = match.group(1)
    raw_term = clean_text(text[len(f"The {label} of "):])
    pieces = re.split(r"\bis\b", raw_term, maxsplit=1, flags=re.IGNORECASE)
    if len(pieces) < 2:
        return None

    term = clean_text(pieces[0])
    term = normalize_term(term)
    answer = shorten_answer(pieces[1])

    if is_bad_term(term):
        return None
    if not answer_word_count_ok(answer):
        return None

    question = f"What is the {label} of {term}?"
    if not question_is_valid(question):
        return None

    return {
        "question": clean_text(question),
        "answer": answer
    }


def score_card(card):
    score = 0
    q = card["question"]
    a = card["answer"]

    if 5 <= len(a.split()) <= 18:
        score += 2
    if q.lower().startswith(("what is ", "what are ", "what does ")):
        score += 2
    if "stand for" in q.lower():
        score += 2
    if "used for" in q.lower():
        score += 1
    if len(q.split()) <= 8:
        score += 1
    if any(bad in q.lower() for bad in ["what is what", "what are what"]):
        score -= 5
    if len(a.split()) > 20:
        score -= 3

    return score


@app.post("/generate-flashcards")
def generate_flashcards():
    data = request.get_json(force=True)

    text = data.get("text", "")
    max_cards = int(data.get("max_cards", 10))

    if not text.strip():
        return jsonify({"error": "text is required"}), 400

    doc = nlp(text)
    cards = []

    for sent in doc.sents:
        sent_text = clean_text(sent.text)

        if not valid_sentence(sent_text):
            continue

        card = try_abbreviation_card(sent)
        if not card:
            card = try_purpose_card(sent)
        if not card:
            card = try_usage_card(sent)
        if not card:
            card = try_definition_card(sent)

        if not card:
            continue

        score = score_card(card)

        if score < 3:
            continue

        card["score"] = score
        cards.append(card)

    cards = dedupe_cards(cards)
    cards = cards[:max_cards]

    return jsonify({
        "cards": cards,
        "count": len(cards)
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 6000))
    app.run(host="0.0.0.0", port=port)
