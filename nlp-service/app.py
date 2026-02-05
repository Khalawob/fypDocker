from flask import Flask, request, jsonify
import spacy

nlp = spacy.load("en_core_web_sm")
app = Flask(__name__)

@app.route("/blank", methods=["POST"])
def blank_sentence():
    text = request.json["text"]
    doc = nlp(text)

    result = []
    for token in doc:
        if token.is_stop:
            result.append(token.text)
        else:
            result.append(token.text[0] + "_" * (len(token.text) - 1))

    return jsonify({"result": " ".join(result)})

app.run(port=6000)
