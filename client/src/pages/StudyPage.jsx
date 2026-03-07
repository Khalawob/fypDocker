import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

export default function StudyPage() {
  const { setId } = useParams();
  const navigate = useNavigate();

  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCards() {
      try {
        const data = await apiRequest(`/api/sets/${setId}/cards`);
        setCards(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    loadCards();
  }, [setId]);

  function nextCard() {
    setFlipped(false);

    setIndex((prev) => {
      if (prev + 1 >= cards.length) return prev;
      return prev + 1;
    });
  }

  function markCorrect() {
    nextCard();
  }

  function markIncorrect() {
    nextCard();
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Loading cards...</div>;
  }

  if (error) {
    return <div style={{ padding: 40, color: "red" }}>{error}</div>;
  }

  if (cards.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <p>No cards in this set.</p>
        <button onClick={() => navigate(`/sets/${setId}`)}>Back</button>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>
      <button onClick={() => navigate(`/sets/${setId}`)}>← Back</button>

      <h2 style={{ marginTop: 20 }}>
        Card {index + 1} / {cards.length}
      </h2>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 10,
          padding: 30,
          marginTop: 20,
          textAlign: "center",
          minHeight: 150,
          cursor: "pointer",
        }}
        onClick={() => setFlipped(!flipped)}
      >
        {!flipped ? card.question : card.answer}
      </div>

      {!flipped ? (
        <button
          style={{ marginTop: 20 }}
          onClick={() => setFlipped(true)}
        >
          Flip
        </button>
      ) : (
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={markIncorrect}>Incorrect</button>
          <button onClick={markCorrect}>Correct</button>
        </div>
      )}
    </div>
  );
}