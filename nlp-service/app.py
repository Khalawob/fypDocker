from flask import Flask, request, jsonify  # Flask web framework and helpers for reading requests / returning JSON
import spacy  # spaCy NLP library used for tokenising text and extracting sentence structure
import random  # Used for deterministic or random blank selection
import re  # Regular expressions for text cleaning and pattern matching
import os  # Used to read environment variables such as the port

app = Flask(__name__)  # Create the Flask application
nlp = spacy.load("en_core_web_sm")  # Load the small English spaCy model for NLP processing


# Returns True only if the token text contains letters A-Z only.
# This is used to exclude punctuation, numbers, and mixed symbols from blanking logic.
def is_word(token_text: str) -> bool:
    return bool(re.match(r"^[A-Za-z]+$", token_text))


# Returns True if a token is suitable for blanking:
# - it must be a word
# - it must not be a stop word
# - it must be at least 4 characters long
def eligible_token(t) -> bool:
    return is_word(t.text) and (not t.is_stop) and len(t.text) >= 4


# Normalises blank style input so only the supported values are used.
# If the provided style is invalid or missing, FIRST_LETTER is used by default.
def normalize_blank_style(blank_style: str) -> str:
    value = str(blank_style or "FIRST_LETTER").strip().upper()
    if value not in {"FIRST_LETTER", "FULL"}:
        return "FIRST_LETTER"
    return value


# POST /generate
#
# Generates a blanked-text variation of the supplied text.
# Supported variation types include:
# - ALL_BLANKS
# - RANDOM_BLANKS
# - KEY_TERMS_ONLY
# - EVERY_OTHER_WORD
# - INCREASING_DIFFICULTY
# - DIFFICULTY_LEVEL_BLANKS
#
# Returns:
# - blanked_text
# - first_letter_clues

@app.post("/generate")
def generate():
    data = request.get_json(force=True)  # Force JSON parsing from the request body

    text = data.get("text", "")  # Original answer text to transform
    variation_type = str(data.get("variation_type", "ALL_BLANKS")).strip().upper()  # Which blanking strategy to use
    blank_style = normalize_blank_style(data.get("blank_style", "FIRST_LETTER"))  # Whether blanks show first letters or full underscores

    blank_ratio = data.get("blank_ratio", None)  # Optional ratio used by random-based blanking modes
    seed = data.get("seed", None)  # Optional seed for deterministic random output

    # Parameters used by INCREASING_DIFFICULTY mode
    attempt_number = int(data.get("attempt_number", 1))
    base_blank_ratio = float(data.get("base_blank_ratio", 0.30))
    step = float(data.get("step", 0.15))
    max_blank_ratio = float(data.get("max_blank_ratio", 0.85))

    # Parameter used by DIFFICULTY_LEVEL_BLANKS mode
    difficulty_level = int(data.get("difficulty_level", 1))

    # Text is required for variation generation.
    if not text.strip():
        return jsonify({"error": "text is required"}), 400

    # If a seed is supplied, use it so output is repeatable for the same request.
    if seed is not None:
        random.seed(seed)

    doc = nlp(text)  # Process the text with spaCy
    candidates = [t for t in doc if eligible_token(t)]  # Tokens eligible to be blanked
    blank_set = set()  # Final set of tokens that will be blanked

    # blank_style now controls rendering only
    # FIRST_LETTER means something like "p____"
    # FULL means something like "_____"
    blank_with_first_letter = blank_style == "FIRST_LETTER"

    
    # ALL_BLANKS
    # Blank all eligible words
    # ----------------------------
    if variation_type == "ALL_BLANKS":
        blank_set = set(candidates)

    
    # RANDOM_BLANKS
    # Blank a percentage of eligible words
    
    elif variation_type == "RANDOM_BLANKS":
        ratio = float(blank_ratio) if blank_ratio is not None else 0.40
        ratio = max(0.0, min(1.0, ratio))  # Clamp ratio to 0..1

        if not candidates:
            blank_set = set()
        else:
            k = max(1, int(len(candidates) * ratio))  # Number of tokens to blank
            blank_set = set(random.sample(candidates, min(k, len(candidates))))

    
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

    
    # EVERY_OTHER_WORD
    # Blank every other eligible word
    # ----------------------------
    elif variation_type == "EVERY_OTHER_WORD":
        blank_set = set(candidates[::2])

    
    # INCREASING_DIFFICULTY
    # More blanks each attempt
    # ----------------------------
    elif variation_type == "INCREASING_DIFFICULTY":
        if blank_ratio is not None:
            ratio = float(blank_ratio)
        else:
            ratio = base_blank_ratio + step * (attempt_number - 1)

        ratio = max(0.0, min(max_blank_ratio, ratio))  # Cap difficulty growth

        if not candidates:
            blank_set = set()
        else:
            if ratio >= 1.0:
                blank_set = set(candidates)
            else:
                k = max(1, int(len(candidates) * ratio))
                blank_set = set(random.sample(candidates, min(k, len(candidates))))

    
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

    # Reject unsupported variation types.
    else:
        return jsonify({"error": f"Unknown variation_type: {variation_type}"}), 400

    out_tokens = []  # Final visible blanked output
    clue_tokens = []  # Separate output including first-letter clues

    # Rebuild the sentence token by token, replacing selected tokens with blanks.
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

        # Preserve original whitespace so the output looks natural.
        if t.whitespace_:
            out_tokens.append(t.whitespace_)
            clue_tokens.append(t.whitespace_)

    blanked_text = "".join(out_tokens).strip()  # Main blanked sentence shown to the user
    first_letter_clues = "".join(clue_tokens).strip()  # Clue sentence used when first-letter mode is active

    return jsonify({
        "blanked_text": blanked_text,
        "first_letter_clues": first_letter_clues if blank_with_first_letter else ""
    })


# Set of bad or vague terms that should not become flashcard subjects.
BAD_TERMS = {
    "what", "which", "who", "where", "when", "why", "how",
    "this", "that", "these", "those",
    "it", "they", "them", "he", "she", "we", "you",
    "something", "anything", "someone", "somebody"
}

# Heuristic limits used when deciding whether a sentence/card is suitable.
MAX_SENTENCE_WORDS = 30
MIN_SENTENCE_WORDS = 5
MAX_ANSWER_WORDS = 20
MIN_ANSWER_WORDS = 1


# Cleans general text by collapsing whitespace and removing spaces before punctuation.
def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text


# Normalises a candidate term by cleaning it and stripping a leading "the".
def normalize_term(term: str) -> str:
    term = clean_text(term)
    term = re.sub(r"^the\s+", "", term, flags=re.IGNORECASE)
    return term.strip()


# Returns True for terms that are too vague, too short, or unsuitable for card subjects.
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


# Checks whether a sentence is suitable for generating a flashcard.
# It filters out:
# - very short or very long sentences
# - questions
# - vague pronoun-led sentences like "This ..." or "It ..."
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


# Tries to extract a usable subject phrase from a sentence based on dependency parsing.
# This is mainly used for definition-style cards.
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


# Shortens an answer phrase by cutting off explanatory clauses and limiting length.
# This helps keep generated flashcard answers concise and revision-friendly.
def shorten_answer(text: str, keep_that_clause: bool = False):
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


# Validates that an answer has an acceptable word count.
def answer_word_count_ok(answer: str) -> bool:
    wc = len(answer.split())
    return MIN_ANSWER_WORDS <= wc <= MAX_ANSWER_WORDS


# Filters out bad/generated question patterns that are too vague or broken.
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


# Removes duplicate cards by comparing lowercase question+answer pairs.
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


# Attempts to create an abbreviation card from sentences like:
# "CPU stands for Central Processing Unit."
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


# Attempts to create a usage card from sentences like:
# "X is used for ..."
# "X is used to ..."
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


# Attempts to create a definition/meaning card from sentences whose root verb
# suggests a definition, such as "X is ...", "X refers to ...", or "X means ..."
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


# Attempts to create a purpose/function/role card from sentences like:
# "The purpose of X is ..."
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


# Heuristic scoring for generated cards.
# Cards that look clearer, shorter, and more revision-friendly get higher scores.
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



# POST /generate-flashcards
#
# Generates draft flashcards from raw source text by:
# 1) splitting into sentences
# 2) trying different card-generation patterns
# 3) scoring/filtering results
# 4) deduplicating and limiting output
# -----------------------------------------------------------------------------
@app.post("/generate-flashcards")
def generate_flashcards():
    data = request.get_json(force=True)  # Force JSON parsing from the request
    text = data.get("text", "")  # Source document text
    max_cards = int(data.get("max_cards", 10))  # Maximum number of cards to return

    if not text.strip():
        return jsonify({"error": "text is required"}), 400

    doc = nlp(text)  # Process source text with spaCy
    cards = []  # Collected candidate cards

    # Walk sentence by sentence and try multiple generation strategies.
    for sent in doc.sents:
        sent_text = clean_text(sent.text)

        if not valid_sentence(sent_text):
            continue

        # Try several card extraction patterns in priority order.
        card = try_abbreviation_card(sent)
        if not card:
            card = try_purpose_card(sent)
        if not card:
            card = try_usage_card(sent)
        if not card:
            card = try_definition_card(sent)

        if not card:
            continue

        # Score the card and discard weak candidates.
        score = score_card(card)

        if score < 3:
            continue

        card["score"] = score
        cards.append(card)

    # Remove duplicates and enforce the maximum card limit.
    cards = dedupe_cards(cards)
    cards = cards[:max_cards]

    return jsonify({
        "cards": cards,
        "count": len(cards)
    })


# Entry point for running the Flask service directly.
# Uses PORT from the environment, defaulting to 6000.
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 6000))
    app.run(host="0.0.0.0", port=port)
