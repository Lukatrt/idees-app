import { useState, useEffect, useRef } from "react";

// ── Tokens (palette "campagne contemporaine" : papier chaulé, encre vert-charbon,
//    accent vert pin. Couleurs adaptées pour un contraste optimal WCAG AA)
const T = {
  bg: "#ECEEE8",
  surface: "#FBFCFA",
  surfaceAlt: "#F3F4EE",
  ink: "#23271F",
  muted: "#3E4337",        // Assombri de #565B4F pour meilleur contraste sur fond clair (> 4.5:1)
  faint: "#5A6051",        // Assombri de #868B7C pour être lisible
  line: "#DBDED3",
  accent: "#2F6B43",
  accentDark: "#23512F",
  accentSoft: "#E4EBDF",
  accentInk: "#1F4A2C",
  danger: "#8F2418",       // Assombri de #9B3B2E pour un meilleur contraste
};
const FONT_UI = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_DISP = "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif";
const CAT_COLORS = ["#3F7150", "#B5673F", "#4E6E8E", "#B98A2E", "#7E5A78", "#7C8A4E"];

const DEFAULT_CATEGORIES = [
  { id: "maison", label: "Maison", color: "#3F7150", removable: false },
  { id: "travaux", label: "Travaux", color: "#B5673F", removable: false },
  { id: "afaire", label: "À faire", color: "#4E6E8E", removable: false },
  { id: "atrouver", label: "À trouver", color: "#B98A2E", removable: false },
];

const STORAGE_KEY = "idees-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Helper to render text with clickable links
function renderTextWithLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="fx"
          style={{
            color: T.accent,
            textDecoration: "underline",
            wordBreak: "break-all",
            fontWeight: 600,
            padding: "2px 4px",
            display: "inline-block",
          }}
          onClick={(e) => e.stopPropagation()} // Prevent opening edit mode on click
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function App() {
  // Synchronous loading from localStorage to prevent UI flicker
  const [ideas, setIdeas] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.ideas)) return data.ideas;
      }
    } catch (e) {
      console.error("Failed to load ideas from localStorage", e);
    }
    return [];
  });

  const [categories, setCategories] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.categories) && data.categories.length) return data.categories;
      }
    } catch (e) {
      console.error("Failed to load categories from localStorage", e);
    }
    return DEFAULT_CATEGORIES;
  });

  const [saveState, setSaveState] = useState("ok");
  const [view, setView] = useState("inbox"); // 'inbox' | 'ranged'
  const [tab, setTab] = useState("maison"); // selected category in Ranged, or 'done'
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [toast, setToast] = useState(null);
  const [live, setLive] = useState("");

  const inputRef = useRef(null);
  const toastTimer = useRef(null);

  // Auto-save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ideas, categories }));
      setSaveState("ok");
    } catch (e) {
      console.error("Failed to save to localStorage", e);
      setSaveState("error");
    }
  }, [ideas, categories]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function announce(msg) { setLive(""); requestAnimationFrame(() => setLive(msg)); }
  function showToast(message, undo) {
    clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  // ── Actions
  function addIdea() {
    const v = text.trim();
    if (!v) return;
    setIdeas((p) => [{ id: uid(), text: v, createdAt: Date.now(), status: "inbox", category: null }, ...p]);
    setText("");
    announce("Idée ajoutée");
    if (inputRef.current) inputRef.current.focus();
  }
  function fileIdea(id, catId) {
    const cat = categories.find((c) => c.id === catId);
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: catId } : i)));
    announce(cat ? `Rangé dans ${cat.label}` : "Rangé");
  }
  function moveIdea(id, target) {
    if (target === "__inbox") {
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "inbox", category: null } : i)));
      announce("Renvoyé dans À trier");
    } else {
      const cat = categories.find((c) => c.id === target);
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: target } : i)));
      announce(cat ? `Déplacé dans ${cat.label}` : "Déplacé");
    }
  }
  function toggleDone(id) {
    setIdeas((p) => p.map((i) => {
      if (i.id !== id) return i;
      const isDoneNow = i.status !== "done";
      announce(isDoneNow ? "Idée marquée comme terminée" : "Idée réactivée");
      return isDoneNow
        ? { ...i, status: "done" }
        : { ...i, status: i.category ? "classed" : "inbox" };
    }));
  }
  function removeIdea(id) {
    const idx = ideas.findIndex((i) => i.id === id);
    const removed = ideas[idx];
    if (!removed) return;
    setIdeas((p) => p.filter((i) => i.id !== id));
    announce("Idée supprimée");
    showToast("Idée supprimée", () => {
      setIdeas((p) => {
        const copy = p.slice();
        copy.splice(Math.min(idx, copy.length), 0, removed);
        return copy;
      });
      setToast(null);
      announce("Suppression annulée");
    });
  }
  function startEdit(item) { setEditingId(item.id); setEditDraft(item.text); }
  function commitEdit() {
    const v = editDraft.trim();
    if (v) {
      setIdeas((p) => p.map((i) => (i.id === editingId ? { ...i, text: v } : i)));
      announce("Idée modifiée");
    }
    setEditingId(null); setEditDraft("");
  }
  function addCategory() {
    const label = newCat.trim();
    if (!label) return;
    const color = CAT_COLORS[categories.length % CAT_COLORS.length];
    const cat = { id: uid(), label, color, removable: true };
    setCategories((p) => [...p, cat]);
    setNewCat(""); setAddingCat(false); setTab(cat.id); announce(`Catégorie ${label} créée`);
  }
  function removeCategory(catId) {
    setIdeas((p) => p.map((i) => (i.category === catId && i.status !== "done" ? { ...i, category: null, status: "inbox" } : i)));
    setCategories((p) => p.filter((c) => c.id !== catId));
    setTab((cur) => (cur === catId ? (categories.find((c) => c.id !== catId)?.id || "done") : cur));
    announce("Catégorie supprimée. Les idées associées ont été renvoyées dans À trier.");
  }

  const inbox = ideas.filter((i) => i.status === "inbox");
  const doneItems = ideas.filter((i) => i.status === "done");
  const catCount = (id) => ideas.filter((i) => i.status === "classed" && i.category === id).length;
  const catOf = (id) => categories.find((c) => c.id === id);

  const visibleRanged = (() => {
    const f = filter.trim().toLowerCase();
    if (tab === "done") {
      let list = doneItems;
      if (f) list = list.filter((i) => i.text.toLowerCase().includes(f));
      return list;
    }
    let list = ideas.filter((i) => i.status === "classed" && i.category === tab);
    if (f) list = list.filter((i) => i.text.toLowerCase().includes(f));
    return list;
  })();

  const css = `
input::placeholder { color: ${T.faint}; }
button { cursor: pointer; font-family: ${FONT_UI}; }
.fx:focus-visible, .fx:focus-visible + label, input.fx:focus-visible, select.fx:focus-visible {
  outline: 3px solid ${T.accent}; outline-offset: 2px; border-radius: 8px;
}
@keyframes idea-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.idea-in { animation: idea-in .16s ease-out; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

  const Segment = ({ active, onClick, children }) => (
    <button
      className="fx"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontFamily: FONT_DISP, fontWeight: 600, fontSize: 14, letterSpacing: "0.01em",
        padding: "10px 18px", borderRadius: 999, border: "1px solid",
        borderColor: active ? T.accent : T.line,
        background: active ? T.accent : "transparent",
        color: active ? "#fff" : T.muted, minHeight: 44, whiteSpace: "nowrap", // minHeight 44px tactile target
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ background: T.bg, minHeight: "100%", fontFamily: FONT_UI, color: T.ink }}>
      <style>{css}</style>
      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{live}</div>

      <div className="mx-auto" style={{ maxWidth: 680, padding: "0 16px 120px" }}>
        {/* Header */}
        <header className="flex items-center justify-between" style={{ paddingTop: 22, paddingBottom: 14 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>idées</h1>
            <span style={{ fontSize: 12, color: saveState === "error" ? T.danger : T.faint }}>
              {saveState === "ok" && "enregistré"}
              {saveState === "error" && "erreur d’enregistrement"}
            </span>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <Segment active={view === "inbox"} onClick={() => setView("inbox")}>À trier {inbox.length ? ` · ${inbox.length}` : ""}</Segment>
            <Segment active={view === "ranged"} onClick={() => setView("ranged")}>Rangé</Segment>
          </div>
        </header>

        {/* Instanteous Capture - Always at the top */}
        <div className="sticky" style={{ top: 0, zIndex: 5, background: T.bg, paddingTop: 6, paddingBottom: 10 }}>
          <div className="flex" style={{ gap: 8 }}>
            <input
              ref={inputRef}
              className="fx w-full"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }}
              placeholder="Noter une idée (Entrée pour enregistrer)..."
              aria-label="Saisir une nouvelle idée"
              autoFocus
              style={{
                flex: 1, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
                padding: "13px 14px", fontSize: 16, color: T.ink, fontFamily: FONT_UI, minHeight: 48,
              }}
            />
            <button
              className="fx"
              onClick={addIdea}
              disabled={!text.trim()}
              style={{
                background: text.trim() ? T.accent : T.surfaceAlt,
                color: text.trim() ? "#fff" : T.muted,
                border: "none", borderRadius: 12, padding: "0 18px", fontSize: 15, fontWeight: 600,
                minHeight: 48, fontFamily: FONT_DISP,
              }}
            >
              Ajouter
            </button>
          </div>
        </div>

        {view === "inbox" ? (
          <InboxView
            inbox={inbox}
            categories={categories}
            onFile={fileIdea}
            onEdit={startEdit}
            onRemove={removeIdea}
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            onCommitEdit={commitEdit}
            onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
          />
        ) : (
          <RangedView
            categories={categories}
            tab={tab}
            setTab={setTab}
            catCount={catCount}
            doneCount={doneItems.length}
            filter={filter}
            setFilter={setFilter}
            items={visibleRanged}
            catOf={catOf}
            onToggleDone={toggleDone}
            onMove={moveIdea}
            onEdit={startEdit}
            onRemove={removeIdea}
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            onCommitEdit={commitEdit}
            onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
            addingCat={addingCat}
            setAddingCat={setAddingCat}
            newCat={newCat}
            setNewCat={setNewCat}
            onAddCat={addCategory}
            onRemoveCat={removeCategory}
          />
        )}
      </div>

      {/* Undo Toast */}
      {toast && (
        <div className="idea-in" style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 22,
          background: T.ink, color: "#fff", borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 16, fontSize: 14.5, boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
          maxWidth: "calc(100% - 32px)", zIndex: 10
        }}>
          <span>{toast.message}</span>
          {toast.undo && (
            <button className="fx" onClick={toast.undo} style={{
              background: "transparent", color: "#9FD8AE", border: "none", fontWeight: 700, fontSize: 14.5, padding: "8px 12px", minHeight: 44
            }}>Annuler</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Editable Idea Text component
function IdeaText({ item, editing, editDraft, setEditDraft, onCommit, onCancel, struck }) {
  if (editing) {
    return (
      <input
        className="fx w-full"
        autoFocus
        value={editDraft}
        onChange={(e) => setEditDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
        onBlur={onCommit}
        aria-label="Modifier le texte"
        style={{ background: "#fff", border: `1px solid ${T.accent}`, borderRadius: 8, padding: "10px 12px", fontSize: 15.5, color: T.ink, fontFamily: FONT_UI, minHeight: 44 }}
      />
    );
  }
  return (
    <div style={{ fontSize: 15.5, lineHeight: 1.45, color: struck ? T.faint : T.ink, textDecoration: struck ? "line-through" : "none", wordBreak: "break-word" }}>
      {renderTextWithLinks(item.text)}
    </div>
  );
}

function TextButton({ children, onClick, danger }) {
  return (
    <button className="fx" onClick={onClick} style={{
      background: "transparent", border: "none", padding: "10px 12px", fontSize: 13.5, fontWeight: 600,
      color: danger ? T.danger : T.muted, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>{children}</button>
  );
}

function InboxView({ inbox, categories, onFile, onEdit, onRemove, editingId, editDraft, setEditDraft, onCommitEdit, onCancelEdit }) {
  if (inbox.length === 0) {
    return (
      <div style={{ marginTop: 28, padding: "32px 20px", textAlign: "center", border: `1px dashed ${T.line}`, borderRadius: 14, color: T.muted }}>
        <p style={{ margin: 0, fontFamily: FONT_DISP, fontWeight: 600, color: T.ink, fontSize: 16 }}>Rien à trier</p>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.4 }}>Notez une idée au-dessus. Vous la classerez plus tard, au calme.</p>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 12px 2px", fontWeight: 500 }}>
        {inbox.length} {inbox.length > 1 ? "idées à ranger" : "idée à ranger"}
      </p>
      <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
        {inbox.map((item) => (
          <div key={item.id} className="idea-in" style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
            <div style={{ marginBottom: 12 }}>
              <IdeaText item={item} editing={editingId === item.id} editDraft={editDraft} setEditDraft={setEditDraft} onCommit={onCommitEdit} onCancel={onCancelEdit} />
            </div>
            <div className="flex items-center" style={{ flexWrap: "wrap", gap: 8 }}>
              {categories.map((c) => (
                <button key={c.id} className="fx" onClick={() => onFile(item.id, c.id)} style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: T.accentSoft,
                  border: `1px solid ${T.accentSoft}`, color: T.accentInk, borderRadius: 999,
                  padding: "10px 16px", fontSize: 13.5, fontWeight: 600, minHeight: 44, // 44px tactile target
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c.color }} aria-hidden="true" />
                  Ranger dans {c.label}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <TextButton onClick={() => onEdit(item)}>Modifier</TextButton>
              <TextButton onClick={() => onRemove(item.id)} danger>Supprimer</TextButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RangedView(props) {
  const {
    categories, tab, setTab, catCount, doneCount, filter, setFilter, items, catOf,
    onToggleDone, onMove, onEdit, onRemove, editingId, editDraft, setEditDraft, onCommitEdit, onCancelEdit,
    addingCat, setAddingCat, newCat, setNewCat, onAddCat, onRemoveCat,
  } = props;

  const currentCat = catOf(tab);

  return (
    <div style={{ marginTop: 16 }}>
      {/* Category Tabs */}
      <div className="flex items-center" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {categories.map((c) => {
          const active = tab === c.id;
          return (
            <button key={c.id} className="fx" onClick={() => setTab(c.id)} aria-pressed={active} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: active ? "#fff" : "transparent",
              border: `1px solid ${active ? c.color : T.line}`,
              color: active ? T.ink : T.muted, borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 500, minHeight: 44,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: c.color }} aria-hidden="true" />
              {c.label}
              <span style={{ color: T.muted, fontSize: 13, marginLeft: 4, fontWeight: 600 }}>{catCount(c.id)}</span>
            </button>
          );
        })}
        <button className="fx" onClick={() => setTab("done")} aria-pressed={tab === "done"} style={{
          background: tab === "done" ? "#fff" : "transparent",
          border: `1px solid ${tab === "done" ? T.muted : T.line}`,
          color: tab === "done" ? T.ink : T.muted, borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 500, minHeight: 44,
        }}>
          Fait <span style={{ color: T.muted, fontSize: 13, marginLeft: 4, fontWeight: 600 }}>{doneCount}</span>
        </button>

        {addingCat ? (
          <span className="flex items-center" style={{ gap: 6 }}>
            <input
              className="fx" autoFocus value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddCat(); if (e.key === "Escape") { setAddingCat(false); setNewCat(""); } }}
              placeholder="Nom"
              aria-label="Nom de la nouvelle catégorie"
              style={{ background: "#fff", border: `1px solid ${T.accent}`, borderRadius: 999, padding: "8px 14px", fontSize: 14, width: 120, fontFamily: FONT_UI, minHeight: 44 }}
            />
            <TextButton onClick={onAddCat}>Créer</TextButton>
          </span>
        ) : (
          <button className="fx" onClick={() => setAddingCat(true)} style={{
            background: "transparent", border: `1px dashed ${T.line}`, color: T.muted,
            borderRadius: 999, padding: "10px 16px", fontSize: 14, minHeight: 44,
          }}>+ Catégorie</button>
        )}
      </div>

      {/* Filter field */}
      <input
        className="fx w-full"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Rechercher / Filtrer les idées..."
        aria-label="Rechercher les idées dans cette catégorie"
        style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, marginBottom: 14, color: T.ink, fontFamily: FONT_UI, minHeight: 44 }}
      />

      {/* Section Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <h2 style={{ fontFamily: FONT_DISP, fontWeight: 600, fontSize: 15, margin: 0, color: T.muted, letterSpacing: "0.01em" }}>
          {tab === "done" ? "Terminé" : currentCat?.label}
          <span style={{ color: T.faint, fontWeight: 500 }}> · {items.length}</span>
        </h2>
        {currentCat?.removable && (
          <TextButton onClick={() => { if (confirm(`Supprimer la catégorie « ${currentCat.label} » ? Les idées non terminées repartiront dans « À trier ».`)) onRemoveCat(currentCat.id); }} danger>
            Supprimer la catégorie
          </TextButton>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "28px 18px", border: `1px dashed ${T.line}`, borderRadius: 14, color: T.muted, fontSize: 14, textAlign: "center" }}>
          {tab === "done" ? "Aucune idée terminée pour l'instant." : filter.trim() ? "Aucune idée ne correspond à votre recherche." : "Catégorie vide. Rangez une idée depuis « À trier »."}
        </div>
      ) : (
        <div className="flex" style={{ flexDirection: "column", gap: 8 }}>
          {items.map((item) => {
            const done = item.status === "done";
            const itemCat = catOf(item.category);
            return (
              <div key={item.id} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "8px 14px" }}>
                <div className="flex" style={{ gap: 8, alignItems: "flex-start" }}>
                  {/* Accessibility-friendly large checkbox touch target */}
                  <button
                    className="fx"
                    onClick={() => onToggleDone(item.id)}
                    role="checkbox"
                    aria-checked={done}
                    aria-label={done ? "Marquer comme à faire" : "Marquer comme fait"}
                    style={{
                      marginTop: 2, flexShrink: 0, width: 44, height: 44, borderRadius: 8,
                      border: "none", background: "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: 6,
                      border: `1.5px solid ${done ? T.accent : T.line}`, background: done ? T.accent : "#fff",
                      color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: "bold"
                    }}>
                      {done ? "✓" : ""}
                    </span>
                  </button>
                  
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 10 }}>
                    <IdeaText item={item} editing={editingId === item.id} editDraft={editDraft} setEditDraft={setEditDraft} onCommit={onCommitEdit} onCancel={onCancelEdit} struck={done} />
                    <div className="flex items-center" style={{ flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {tab === "done" && itemCat && (
                        <span className="flex items-center" style={{ gap: 6, fontSize: 13, color: T.muted, marginRight: 8, fontWeight: 500 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: itemCat.color }} aria-hidden="true" />
                          {itemCat.label}
                        </span>
                      )}
                      {!done && (
                        <label className="flex items-center" style={{ gap: 8, minHeight: 44 }}>
                          <span style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>Déplacer dans</span>
                          <select
                            className="fx"
                            value={item.category || ""}
                            onChange={(e) => onMove(item.id, e.target.value)}
                            aria-label="Déplacer vers une autre catégorie"
                            style={{ fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.ink, fontFamily: FONT_UI, minHeight: 44 }}
                          >
                            {props.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            <option value="__inbox">→ À trier</option>
                          </select>
                        </label>
                      )}
                      <span style={{ flex: 1 }} />
                      {!done && <TextButton onClick={() => onEdit(item)}>Modifier</TextButton>}
                      <TextButton onClick={() => onRemove(item.id)} danger>Supprimer</TextButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
