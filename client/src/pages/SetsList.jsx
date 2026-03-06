import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../api";
import { useNavigate } from "react-router-dom";

export default function SetsList() {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const loadSets = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/api/sets");
      setSets(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  async function createSet(e) {
    e.preventDefault();
    setError("");

    if (!newTitle.trim()) {
      setError("Title is required.");
      return;
    }

    try {
      await apiRequest("/api/sets", {
        method: "POST",
        body: {
          title: newTitle.trim(),
          description: newDesc.trim() || null,
        },
      });

      setNewTitle("");
      setNewDesc("");
      await loadSets();
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteSet(setId) {
    if (!window.confirm("Delete this set? This will delete its cards too.")) return;

    setError("");
    try {
      await apiRequest(`/api/sets/${setId}`, { method: "DELETE" });
      setSets((prev) => prev.filter((s) => s.set_id !== setId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function editSet(set) {
    const title = window.prompt("New title:", set.title);
    if (title === null) return;

    const description = window.prompt(
      "New description (optional):",
      set.description || ""
    );
    if (description === null) return;

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setError("");
    try {
      await apiRequest(`/api/sets/${set.set_id}`, {
        method: "PUT",
        body: {
          title: title.trim(),
          description: description.trim() || null,
        },
      });
      await loadSets();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", padding: 16 }}>
      <h2>My Flashcard Sets</h2>

      <form
        onSubmit={createSet}
        style={{ display: "grid", gap: 8, maxWidth: 520, marginTop: 12 }}
      >
        <input
          placeholder="Set title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <textarea
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          rows={3}
        />
        <button type="submit">Create set</button>
      </form>

      {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading…</p>
      ) : sets.length === 0 ? (
        <p style={{ marginTop: 16 }}>No sets yet. Create one above.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {sets.map((s) => (
            <div
              key={s.set_id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{ cursor: "pointer", flex: 1 }}
                onClick={() => navigate(`/sets/${s.set_id}`)}
              >
                <div style={{ fontWeight: 700 }}>{s.title}</div>
                <div style={{ opacity: 0.8 }}>
                  {s.description || "No description"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Last modified: {s.last_modified ? String(s.last_modified) : "—"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={() => editSet(s)}>
                  Edit
                </button>
                <button type="button" onClick={() => deleteSet(s.set_id)}>
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