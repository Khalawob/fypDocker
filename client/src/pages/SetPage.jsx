import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../api";
import { useNavigate, useParams } from "react-router-dom";

export default function SetPage() {
  const { setId } = useParams();
  const navigate = useNavigate();

  const [setInfo, setSetInfo] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);

    try {
      const s = await apiRequest(`/api/sets/${setId}`);
      const c = await apiRequest(`/api/sets/${setId}/cards`);
      setSetInfo(s);
      setCards(c);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addCard(e) {
    e.preventDefault();
    setError("");

    if (!q.trim() || !a.trim()) {
      setError("Question and answer are required.");
      return;
    }

    try {
      const created = await apiRequest(`/api/sets/${setId}/cards`, {
        method: "POST",
        body: {
          question: q.trim(),
          answer: a.trim(),
        },
      });

      setQ("");
      setA("");

      // If backend returns the created card object, use it immediately.
      if (created && created.flashcard_id) {
        setCards((prev) => [created, ...prev]);
      } else {
        await load();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function editCard(card) {
    const question = window.prompt("Edit question:", card.question);
    if (question === null) return;

    const answer = window.prompt("Edit answer:", card.answer);
    if (answer === null) return;

    if (!question.trim() || !answer.trim()) {
      setError("Question and answer are required.");
      return;
    }

    setError("");
    try {
      await apiRequest(`/api/cards/${card.flashcard_id}`, {
        method: "PUT",
        body: {
          question: question.trim(),
          answer: answer.trim(),
        },
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteCard(cardId) {
    if (!window.confirm("Delete this card?")) return;

    setError("");
    try {
      await apiRequest(`/api/cards/${cardId}`, { method: "DELETE" });
      setCards((prev) => prev.filter((c) => c.flashcard_id !== cardId));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
        <button type="button" onClick={() => navigate("/sets")}>
          ← Back
        </button>
        <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
      <button type="button" onClick={() => navigate("/sets")}>
        ← Back
      </button>

      <h2 style={{ marginTop: 12 }}>{setInfo?.title || "Set"}</h2>
      <div style={{ opacity: 0.8 }}>
        {setInfo?.description || "No description"}
      </div>

      <form
        onSubmit={addCard}
        style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 700 }}
      >
        <input
          placeholder="Question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <textarea
          placeholder="Answer"
          value={a}
          onChange={(e) => setA(e.target.value)}
          rows={4}
        />
        <button type="submit">Add card</button>
      </form>

      {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

      <h3 style={{ marginTop: 20 }}>Cards ({cards.length})</h3>

      {cards.length === 0 ? (
        <p>No cards yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {cards.map((c) => (
            <div
              key={c.flashcard_id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 700 }}>{c.question}</div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                {c.answer}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => editCard(c)}>
                  Edit
                </button>
                <button type="button" onClick={() => deleteCard(c.flashcard_id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}