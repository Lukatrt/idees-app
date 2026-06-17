import { useState, useEffect, useRef } from "react";

// ── Default Categories
const DEFAULT_CATEGORIES = [
  { id: "maison", label: "Maison", color: "#3F7150", removable: false },
  { id: "travaux", label: "Travaux", color: "#B5673F", removable: false },
  { id: "afaire", label: "À faire", color: "#4E6E8E", removable: false },
  { id: "atrouver", label: "À trouver", color: "#B98A2E", removable: false },
];

const STORAGE_KEY = "idees-v2";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Helper to render text with clickable links
function renderTextWithLinks(text, accentColor) {
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
            color: accentColor,
            textDecoration: "underline",
            wordBreak: "break-all",
            fontWeight: 600,
            padding: "2px 4px",
            display: "inline-block",
          }}
          onClick={(e) => e.stopPropagation()} // Stop propagation to avoid opening Bottom Sheet
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// ── Call Gemini API client-side
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || response.statusText);
  }
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

export default function App() {
  // ── States & Persistence
  const [ideas, setIdeas] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.ideas)) return data.ideas;
      }
    } catch (e) {
      console.error("Failed to load ideas", e);
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
      console.error("Failed to load categories", e);
    }
    return DEFAULT_CATEGORIES;
  });

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("idees-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [inputPosition, setInputPosition] = useState(() => {
    return localStorage.getItem("idees-input-position") || "bottom"; // Mobile first default
  });

  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem("idees-gemini-key") || "";
  });

  const [view, setView] = useState("inbox"); // 'inbox' | 'ranged'
  const [tab, setTab] = useState("maison"); // selected category or 'done'
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [toast, setToast] = useState(null);
  const [live, announce] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  // Bottom Sheet UI
  const [activeIdea, setActiveIdea] = useState(null); 
  const [activeIdeaText, setActiveIdeaText] = useState("");
  
  // AI status
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const inputRef = useRef(null);
  const toastTimer = useRef(null);

  // Sync theme class
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("idees-theme", theme);
  }, [theme]);

  // Sync settings
  useEffect(() => {
    localStorage.setItem("idees-input-position", inputPosition);
  }, [inputPosition]);

  // Auto-save data
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ideas, categories }));
  }, [ideas, categories]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Show undo toast
  function showToast(message, undo) {
    clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  // Helper to suggest category using Gemini
  async function runAiCategorization(ideaId, ideaText) {
    if (!geminiKey.trim()) return;
    try {
      const catLabels = categories.map(c => c.label);
      const prompt = `Vous êtes un classificateur d'idées. Voici la liste des catégories configurées : [${catLabels.join(", ")}].
Analyse l'idée suivante et suggère la catégorie la plus pertinente. Réponds UNIQUEMENT sous forme d'un objet JSON valide contenant la clé "suggestedCategory" avec pour valeur l'un des labels exacts de la liste, ou null s'il n'y a aucune correspondance claire.
Idée à classer : "${ideaText}"`;
      
      const result = await callGemini(prompt, geminiKey);
      if (result && result.suggestedCategory) {
        const matchedCat = categories.find(c => c.label.toLowerCase() === result.suggestedCategory.toLowerCase());
        if (matchedCat) {
          setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, aiSuggestion: matchedCat.id } : i));
          announce(`IA suggère la catégorie ${matchedCat.label}`);
        }
      }
    } catch (err) {
      console.error("Gemini categorization failed", err);
    }
  }

  // ── Actions
  async function addIdea() {
    const v = text.trim();
    if (!v) return;
    const newId = uid();
    const newIdeaObj = { 
      id: newId, 
      text: v, 
      createdAt: Date.now(), 
      status: "inbox", 
      category: null,
      aiSuggestion: null,
      subtasks: [] 
    };

    setIdeas((p) => [newIdeaObj, ...p]);
    setText("");
    announce("Idée ajoutée dans la boîte à trier");
    if (inputRef.current) inputRef.current.focus();

    // Trigger AI categorization in background
    if (geminiKey.trim()) {
      runAiCategorization(newId, v);
    }
  }

  function fileIdea(id, catId) {
    const cat = categories.find((c) => c.id === catId);
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: catId, aiSuggestion: null } : i)));
    announce(cat ? `Rangé dans ${cat.label}` : "Rangé");
    if (activeIdea && activeIdea.id === id) {
      setActiveIdea(prev => ({ ...prev, status: "classed", category: catId, aiSuggestion: null }));
    }
  }

  function moveIdea(id, target) {
    if (target === "__inbox") {
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "inbox", category: null } : i)));
      announce("Renvoyé dans À trier");
      if (activeIdea && activeIdea.id === id) {
        setActiveIdea(prev => ({ ...prev, status: "inbox", category: null }));
      }
    } else {
      const cat = categories.find((c) => c.id === target);
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: target } : i)));
      announce(cat ? `Déplacé dans ${cat.label}` : "Déplacé");
      if (activeIdea && activeIdea.id === id) {
        setActiveIdea(prev => ({ ...prev, status: "classed", category: target }));
      }
    }
  }

  function toggleDone(id) {
    setIdeas((p) => p.map((i) => {
      if (i.id !== id) return i;
      const isDoneNow = i.status !== "done";
      announce(isDoneNow ? "Marqué comme terminé" : "Marqué comme à faire");
      const nextStatus = isDoneNow ? "done" : (i.category ? "classed" : "inbox");
      
      const updated = { ...i, status: nextStatus };
      if (activeIdea && activeIdea.id === id) {
        setActiveIdea(updated);
      }
      return updated;
    }));
  }

  function removeIdea(id) {
    const idx = ideas.findIndex((i) => i.id === id);
    const removed = ideas[idx];
    if (!removed) return;
    setIdeas((p) => p.filter((i) => i.id !== id));
    setActiveIdea(null);
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

  function saveIdeaText(id, newText) {
    const v = newText.trim();
    if (!v) return;
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, text: v } : i)));
    announce("Texte de l'idée enregistré");
  }

  // ── Subtasks management
  function toggleSubtask(ideaId, subtaskId) {
    setIdeas(prev => prev.map(i => {
      if (i.id !== ideaId) return i;
      const updatedSubtasks = i.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
      const updated = { ...i, subtasks: updatedSubtasks };
      if (activeIdea && activeIdea.id === ideaId) {
        setActiveIdea(updated);
      }
      return updated;
    }));
    announce("Sous-tâche modifiée");
  }

  function addSubtask(ideaId, subtaskText) {
    const t = subtaskText.trim();
    if (!t) return;
    setIdeas(prev => prev.map(i => {
      if (i.id !== ideaId) return i;
      const updatedSubtasks = [...(i.subtasks || []), { id: uid(), text: t, done: false }];
      const updated = { ...i, subtasks: updatedSubtasks };
      if (activeIdea && activeIdea.id === ideaId) {
        setActiveIdea(updated);
      }
      return updated;
    }));
    announce("Sous-tâche ajoutée");
  }

  function removeSubtask(ideaId, subtaskId) {
    setIdeas(prev => prev.map(i => {
      if (i.id !== ideaId) return i;
      const updatedSubtasks = i.subtasks.filter(s => s.id !== subtaskId);
      const updated = { ...i, subtasks: updatedSubtasks };
      if (activeIdea && activeIdea.id === ideaId) {
        setActiveIdea(updated);
      }
      return updated;
    }));
    announce("Sous-tâche supprimée");
  }

  // ── AI Clean up & Restructuring
  async function runAiCleanup(idea) {
    if (!geminiKey.trim()) return;
    setAiLoading(true);
    setAiError("");
    announce("IA structure la note...");
    try {
      const prompt = `Nettoyez, structurez et corrigez cette note prise à la volée. Reformulez-la pour la rendre claire et bien écrite en français.
S'il y a plusieurs étapes, tâches distinctes ou éléments à lister, séparez-les sous forme de liste de tâches. Conservez l'essentiel, ne brodez pas.
Répondez UNIQUEMENT avec un objet JSON valide contenant deux clés :
- "text": (String) la note principale nettoyée et propre.
- "tasks": (Tableau de chaînes) les tâches individuelles à extraire. Si c'est juste une note simple sans liste, renvoyez un tableau vide.

Note à structurer : "${idea.text}"`;
      
      const result = await callGemini(prompt, geminiKey);
      if (result) {
        const cleanedText = result.text || idea.text;
        const newTasks = Array.isArray(result.tasks) 
          ? result.tasks.map(t => ({ id: uid(), text: t, done: false })) 
          : [];
        
        setIdeas(prev => prev.map(i => {
          if (i.id === idea.id) {
            const updated = { ...i, text: cleanedText, subtasks: [...(i.subtasks || []), ...newTasks] };
            setActiveIdea(updated);
            setActiveIdeaText(cleanedText);
            return updated;
          }
          return i;
        }));
        announce("Note structurée par l'IA avec succès !");
      }
    } catch (err) {
      console.error(err);
      setAiError("Erreur lors de l'appel IA. Vérifiez votre clé API dans les options.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── Categories Management
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
    announce("Catégorie supprimée. Idées non terminées renvoyées dans À trier.");
  }

  // ── Lists and counts
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

  // Open Bottom Sheet
  function openDetails(idea) {
    setActiveIdea(idea);
    setActiveIdeaText(idea.text);
    setAiError("");
  }

  // Close Bottom Sheet
  function closeDetails() {
    if (activeIdea) {
      saveIdeaText(activeIdea.id, activeIdeaText);
    }
    setActiveIdea(null);
  }

  // UI variables mapping to CSS custom properties
  const FONT_UI = "var(--font-ui)";
  const FONT_DISP = "var(--font-disp)";

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{live}</div>

      {/* ── Main Container ── */}
      <div className="mx-auto flex" style={{ maxWidth: 680, width: "100%", flexDirection: "column", padding: "0 16px 140px", flex: 1 }}>
        
        {/* Header */}
        <header className="flex items-center justify-between" style={{ paddingTop: 20, paddingBottom: 12 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>idées</h1>
            <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.03em", textTransform: "uppercase" }}>PWA v2</span>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button 
              onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
              className="fx" 
              style={{
                background: "var(--surface-color)", border: "1px solid var(--line-color)", 
                borderRadius: 999, height: 40, padding: "0 14px", fontSize: 13.5, fontWeight: 600, color: "var(--ink-color)"
              }}
            >
              {theme === "light" ? "Mode Sombre" : "Mode Clair"}
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="fx" 
              style={{
                background: "var(--surface-color)", border: "1px solid var(--line-color)", 
                borderRadius: 999, height: 40, padding: "0 14px", fontSize: 13.5, fontWeight: 600, color: "var(--ink-color)"
              }}
            >
              Options
            </button>
          </div>
        </header>

        {/* View Segment selector (À trier / Rangé) */}
        <div className="flex" style={{ gap: 8, paddingBottom: 14 }}>
          <button
            className="fx"
            onClick={() => setView("inbox")}
            aria-pressed={view === "inbox"}
            style={{
              flex: 1, fontFamily: FONT_DISP, fontWeight: 600, fontSize: 14.5, letterSpacing: "0.01em",
              padding: "12px 14px", borderRadius: 12, border: "1px solid",
              borderColor: view === "inbox" ? "var(--accent-color)" : "var(--line-color)",
              background: view === "inbox" ? "var(--accent-color)" : "var(--surface-color)",
              color: view === "inbox" ? "#fff" : "var(--muted-color)", minHeight: 44,
              display: "inline-flex", alignItems: "center", justifyContent: "center"
            }}
          >
            À trier {inbox.length ? ` · ${inbox.length}` : ""}
          </button>
          <button
            className="fx"
            onClick={() => setView("ranged")}
            aria-pressed={view === "ranged"}
            style={{
              flex: 1, fontFamily: FONT_DISP, fontWeight: 600, fontSize: 14.5, letterSpacing: "0.01em",
              padding: "12px 14px", borderRadius: 12, border: "1px solid",
              borderColor: view === "ranged" ? "var(--accent-color)" : "var(--line-color)",
              background: view === "ranged" ? "var(--accent-color)" : "var(--surface-color)",
              color: view === "ranged" ? "#fff" : "var(--muted-color)", minHeight: 44,
              display: "inline-flex", alignItems: "center", justifyContent: "center"
            }}
          >
            Rangé
          </button>
        </div>

        {/* ── Instanteous Capture Field (TOP POSITION) ── */}
        {inputPosition === "top" && (
          <div style={{ paddingTop: 4, paddingBottom: 16 }}>
            <div className="flex" style={{ gap: 8 }}>
              <input
                ref={inputRef}
                className="fx w-full"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }}
                placeholder="Noter une idée sans réfléchir..."
                aria-label="Saisir une nouvelle idée"
                style={{
                  flex: 1, background: "var(--surface-color)", border: "1px solid var(--line-color)", borderRadius: 12,
                  padding: "13px 14px", fontSize: 16, color: "var(--ink-color)", fontFamily: FONT_UI, minHeight: 48,
                }}
              />
              <button
                className="fx"
                onClick={addIdea}
                disabled={!text.trim()}
                style={{
                  background: text.trim() ? "var(--accent-color)" : "var(--surface-alt-color)",
                  color: text.trim() ? "#fff" : "var(--faint-color)",
                  border: "none", borderRadius: 12, padding: "0 18px", fontSize: 15, fontWeight: 600,
                  minHeight: 48, fontFamily: FONT_DISP,
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* ── Views lists ── */}
        {view === "inbox" ? (
          <InboxView
            inbox={inbox}
            categories={categories}
            onFile={fileIdea}
            onOpen={openDetails}
            geminiKey={geminiKey}
            catOf={catOf}
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
            onOpen={openDetails}
            addingCat={addingCat}
            setAddingCat={setAddingCat}
            newCat={newCat}
            setNewCat={setNewCat}
            onAddCat={addCategory}
            onRemoveCat={removeCategory}
          />
        )}
      </div>

      {/* ── Instanteous Capture Field (BOTTOM FLOATING POSITION - default) ── */}
      {inputPosition === "bottom" && (
        <div 
          className="glass-panel" 
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10,
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            borderTop: "1px solid var(--line-color)"
          }}
        >
          <div className="mx-auto flex" style={{ maxWidth: 650, gap: 8 }}>
            <input
              ref={inputRef}
              className="fx w-full"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }}
              placeholder="Noter une idée sans réfléchir..."
              aria-label="Saisir une nouvelle idée"
              style={{
                flex: 1, background: "var(--surface-color)", border: "1px solid var(--line-color)", borderRadius: 12,
                padding: "12px 14px", fontSize: 16, color: "var(--ink-color)", fontFamily: FONT_UI, minHeight: 48,
              }}
            />
            <button
              className="fx"
              onClick={addIdea}
              disabled={!text.trim()}
              style={{
                background: text.trim() ? "var(--accent-color)" : "var(--surface-alt-color)",
                color: text.trim() ? "#fff" : "var(--faint-color)",
                border: "none", borderRadius: 12, padding: "0 18px", fontSize: 15, fontWeight: 600,
                minHeight: 48, fontFamily: FONT_DISP,
              }}
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {/* ── Undo Toast ── */}
      {toast && (
        <div className="idea-in" style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: inputPosition === "bottom" ? 84 : 22,
          background: "var(--ink-color)", color: "var(--bg-color)", borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 16, fontSize: 14.5, boxShadow: "0 6px 24px var(--shadow-hover-color)",
          maxWidth: "calc(100% - 32px)", zIndex: 30
        }}>
          <span style={{ fontWeight: 500 }}>{toast.message}</span>
          {toast.undo && (
            <button className="fx" onClick={toast.undo} style={{
              background: "transparent", color: "var(--accent-color)", border: "none", fontWeight: 700, fontSize: 14.5, padding: "8px 12px", minHeight: 44
            }}>Annuler</button>
          )}
        </div>
      )}

      {/* ── Settings Panel Overlay ── */}
      {showSettings && (
        <div 
          className="fade-in" 
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 40,
            background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center"
          }}
          onClick={() => setShowSettings(false)}
        >
          <div 
            className="premium-card" 
            style={{
              width: "100%", maxWidth: 500, padding: 24, margin: 16, 
              background: "var(--surface-color)", border: "1px solid var(--line-color)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 20, margin: 0 }}>Options & Configuration</h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="fx" 
                style={{
                  background: "var(--surface-alt-color)", border: "none", borderRadius: 8, 
                  height: 44, padding: "0 16px", fontSize: 14, fontWeight: 600, color: "var(--ink-color)"
                }}
              >
                Fermer
              </button>
            </div>

            {/* Position Select */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                Position de la barre de capture
              </label>
              <select
                value={inputPosition}
                onChange={(e) => setInputPosition(e.target.value)}
                className="fx w-full"
                style={{
                  minHeight: 44, padding: "8px 12px", fontSize: 14.5, 
                  borderRadius: 8, border: "1px solid var(--line-color)", 
                  background: "var(--surface-color)", color: "var(--ink-color)"
                }}
              >
                <option value="bottom">Fixée en Bas (Recommandé - Pouce accessible)</option>
                <option value="top">Fixée en Haut (Comme le prototype)</option>
              </select>
            </div>

            {/* Gemini Key Config */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                Clé API Gemini (Optionnel)
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  localStorage.setItem("idees-gemini-key", e.target.value);
                }}
                placeholder="Coller votre clé api ptr_... ou AI Studio"
                className="fx w-full"
                style={{
                  minHeight: 44, padding: "8px 12px", fontSize: 14.5, 
                  borderRadius: 8, border: "1px solid var(--line-color)", 
                  background: "var(--surface-color)", color: "var(--ink-color)",
                  marginBottom: 6
                }}
              />
              <span style={{ fontSize: 12, color: "var(--faint-color)" }}>
                Active la suggestion de catégories et le nettoyage des notes. Obtenez une clé gratuite sur <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: "var(--accent-color)", textDecoration: "underline" }}>Google AI Studio</a>.
              </span>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--line-color)", margin: "24px 0" }} />

            {/* Danger Zone */}
            <div>
              <button
                className="fx w-full"
                onClick={() => {
                  if (confirm("⚠️ VOULEZ-VOUS VRAIMENT TOUT SUPPRIMER ?\nCette action supprimera définitivement toutes vos catégories et toutes vos idées stockées dans ce navigateur. Elle est irréversible.")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                style={{
                  background: "var(--danger-color)", color: "#fff", border: "none",
                  borderRadius: 8, minHeight: 44, fontWeight: 600, fontSize: 14
                }}
              >
                ⚠️ Supprimer absolument toutes les données
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Sheet (Idea Details & Actions) ── */}
      {activeIdea && (
        <div 
          className="fade-in" 
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 50,
            background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", justifyContent: "flex-end"
          }}
          onClick={closeDetails}
        >
          <div 
            className="slide-up glass-panel" 
            style={{
              width: "100%", maxWidth: 680, alignSelf: "center",
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              border: "1px solid var(--line-color)", borderBottom: "none",
              padding: "24px 20px calc(24px + env(safe-area-inset-bottom))",
              maxHeight: "90vh", overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bottom Sheet Header */}
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--faint-color)" }}>
                  {activeIdea.status === "inbox" && "[ Statut : À Classer ]"}
                  {activeIdea.status === "classed" && `[ Statut : Classé dans ${catOf(activeIdea.category)?.label} ]`}
                  {activeIdea.status === "done" && "[ Statut : Terminé ]"}
                </span>
                <div style={{ fontSize: 12, color: "var(--faint-color)", marginTop: 2 }}>
                  Ajouté le {new Date(activeIdea.createdAt).toLocaleDateString("fr-FR")} à {new Date(activeIdea.createdAt).toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button 
                onClick={closeDetails}
                className="fx" 
                style={{
                  background: "var(--surface-alt-color)", border: "none", borderRadius: 999, 
                  height: 44, padding: "0 18px", fontSize: 14.5, fontWeight: 700, color: "var(--ink-color)"
                }}
              >
                Fermer
              </button>
            </div>

            {/* Note Text area */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="active-idea-textarea" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--muted-color)" }}>
                Texte de la note
              </label>
              <textarea
                id="active-idea-textarea"
                value={activeIdeaText}
                onChange={(e) => setActiveIdeaText(e.target.value)}
                style={{
                  width: "100%", minHeight: 100, padding: "12px", fontSize: 16, 
                  borderRadius: 12, border: "1px solid var(--line-color)", 
                  background: "var(--surface-color)", color: "var(--ink-color)",
                  fontFamily: FONT_UI, lineHeight: 1.45, resize: "vertical"
                }}
              />
            </div>

            {/* 🪄 Gemini AI actions inside Bottom Sheet */}
            {geminiKey.trim() && (
              <div style={{ marginBottom: 20 }}>
                <button
                  className="fx w-full"
                  disabled={aiLoading}
                  onClick={() => runAiCleanup(activeIdea)}
                  style={{
                    background: "var(--accent-color)", color: "#fff", border: "none",
                    borderRadius: 12, minHeight: 44, fontWeight: 600, fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                  }}
                >
                  {aiLoading ? "IA réfléchit..." : "🪄 Structurer & Améliorer avec l'IA"}
                </button>
                {aiError && (
                  <div style={{ color: "var(--danger-color)", fontSize: 13, marginTop: 6, fontWeight: 500 }}>
                    {aiError}
                  </div>
                )}
              </div>
            )}

            {/* Checklist subtasks section */}
            <div style={{ marginBottom: 20, borderTop: "1px solid var(--line-color)", paddingTop: 16 }}>
              <h3 style={{ fontFamily: FONT_DISP, fontSize: 16, fontWeight: 600, margin: "0 0 10px 0" }}>
                [ Liste des sous-tâches : {(activeIdea.subtasks || []).length} ]
              </h3>
              
              {/* Add subtask input */}
              <div className="flex" style={{ gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Ajouter une étape, une sous-tâche..."
                  className="fx"
                  id="new-subtask-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addSubtask(activeIdea.id, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  style={{
                    flex: 1, minHeight: 44, padding: "8px 12px", fontSize: 14,
                    borderRadius: 8, border: "1px solid var(--line-color)",
                    background: "var(--surface-color)", color: "var(--ink-color)",
                  }}
                />
                <button
                  className="fx"
                  onClick={() => {
                    const el = document.getElementById("new-subtask-input");
                    if (el) {
                      addSubtask(activeIdea.id, el.value);
                      el.value = "";
                    }
                  }}
                  style={{
                    background: "var(--surface-alt-color)", border: "none", borderRadius: 8,
                    padding: "0 16px", minHeight: 44, fontWeight: 600, color: "var(--ink-color)", fontSize: 14
                  }}
                >
                  Ajouter
                </button>
              </div>

              {/* Subtasks list */}
              {(activeIdea.subtasks || []).length > 0 ? (
                <div className="flex" style={{ flexDirection: "column", gap: 8 }}>
                  {activeIdea.subtasks.map((st) => (
                    <div 
                      key={st.id} 
                      className="flex items-center justify-between" 
                      style={{ 
                        background: "var(--surface-alt-color)", padding: "4px 10px", 
                        borderRadius: 8, minHeight: 44 
                      }}
                    >
                      {/* Checkbox */}
                      <button
                        className="fx"
                        onClick={() => toggleSubtask(activeIdea.id, st.id)}
                        role="checkbox"
                        aria-checked={st.done}
                        aria-label={st.done ? "Décocher" : "Cocher"}
                        style={{
                          background: "transparent", border: "none", 
                          display: "flex", alignItems: "center", gap: 10, flex: 1, textAlign: "left"
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 4,
                          border: `1.5px solid ${st.done ? "var(--accent-color)" : "var(--line-color)"}`,
                          background: st.done ? "var(--accent-color)" : "var(--surface-color)",
                          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: "bold", flexShrink: 0
                        }}>
                          {st.done ? "✓" : ""}
                        </span>
                        <span style={{ 
                          fontSize: 14.5, color: "var(--ink-color)",
                          textDecoration: st.done ? "line-through" : "none",
                          opacity: st.done ? 0.6 : 1
                        }}>
                          {st.text}
                        </span>
                      </button>

                      <button
                        className="fx"
                        onClick={() => removeSubtask(activeIdea.id, st.id)}
                        style={{
                          background: "transparent", border: "none", color: "var(--danger-color)",
                          fontWeight: 600, fontSize: 13, minHeight: 44, padding: "0 10px"
                        }}
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--faint-color)", fontStyle: "italic" }}>
                  Aucune étape détaillée. Utilisez le bouton IA ci-dessus pour en générer automatiquement.
                </p>
              )}
            </div>

            {/* Core Card Organization Actions */}
            <div style={{ borderTop: "1px solid var(--line-color)", paddingTop: 16 }}>
              <h3 style={{ fontFamily: FONT_DISP, fontSize: 16, fontWeight: 600, margin: "0 0 12px 0" }}>
                [ Actions de classement ]
              </h3>
              
              <div className="flex" style={{ flexDirection: "column", gap: 12 }}>
                
                {/* 1. Categorization selections */}
                <div style={{ background: "var(--surface-alt-color)", padding: 12, borderRadius: 12 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                    Classement par catégorie
                  </label>
                  <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
                    {categories.map((c) => {
                      const isAssigned = activeIdea.status === "classed" && activeIdea.category === c.id;
                      return (
                        <button
                          key={c.id}
                          className="fx"
                          onClick={() => fileIdea(activeIdea.id, c.id)}
                          style={{
                            minHeight: 44, borderRadius: 999, border: isAssigned ? `2px solid ${c.color}` : "1px solid var(--line-color)",
                            background: isAssigned ? "var(--surface-color)" : "transparent",
                            padding: "0 14px", fontSize: 13.5, fontWeight: 600, color: "var(--ink-color)",
                            display: "inline-flex", alignItems: "center", gap: 8
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: c.color }} />
                          {isAssigned ? `Rangé dans ${c.label}` : c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Done/Active toggle */}
                <div className="flex" style={{ gap: 8 }}>
                  <button
                    className="fx"
                    onClick={() => toggleDone(activeIdea.id)}
                    style={{
                      flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid var(--line-color)",
                      background: activeIdea.status === "done" ? "var(--surface-alt-color)" : "var(--accent-soft-color)",
                      color: activeIdea.status === "done" ? "var(--ink-color)" : "var(--accent-ink-color)",
                      fontWeight: 600, fontSize: 14
                    }}
                  >
                    {activeIdea.status === "done" ? "[ ↺ Réactiver la note ]" : "[ ✓ Marquer comme Fait ]"}
                  </button>
                  
                  {activeIdea.status !== "inbox" && (
                    <button
                      className="fx"
                      onClick={() => moveIdea(activeIdea.id, "__inbox")}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid var(--line-color)",
                        background: "var(--surface-color)", color: "var(--muted-color)",
                        fontWeight: 600, fontSize: 14
                      }}
                    >
                      [ 📥 Renvoyer à trier ]
                    </button>
                  )}
                </div>

                {/* 3. Delete button */}
                <button
                  className="fx"
                  onClick={() => removeIdea(activeIdea.id)}
                  style={{
                    minHeight: 44, borderRadius: 12, border: "none",
                    background: "var(--danger-color)", color: "#fff",
                    fontWeight: 600, fontSize: 14, width: "100%"
                  }}
                >
                  [ ✕ Supprimer définitivement cette idée ]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Renders a single Idea Card in list view (Aphantasia semantic friendly)
function IdeaCard({ item, onClick, onToggleDone, onFile, categories, catOf }) {
  const hasUrl = item.text.includes("http://") || item.text.includes("https://");
  const itemCat = catOf(item.category);
  const done = item.status === "done";
  
  // Calculate checked progress for subtasks
  const hasSubtasks = item.subtasks && item.subtasks.length > 0;
  const doneSubtasks = hasSubtasks ? item.subtasks.filter(s => s.done).length : 0;

  return (
    <div 
      className="premium-card idea-in fx" 
      onClick={() => onClick(item)}
      style={{ 
        padding: 16, cursor: "pointer", 
        borderLeft: itemCat ? `4px solid ${itemCat.color}` : "1px solid var(--line-color)",
        opacity: done ? 0.65 : 1
      }}
    >
      <div className="flex" style={{ gap: 10, alignItems: "flex-start" }}>
        
        {/* Semantic accessibility checkbox */}
        <button
          className="fx"
          onClick={(e) => {
            e.stopPropagation(); // Avoid opening details drawer
            onToggleDone(item.id);
          }}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Marquer comme actif" : "Marquer comme fait"}
          style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 8,
            border: "none", background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: 5,
            border: `1.5px solid ${done ? "var(--accent-color)" : "var(--line-color)"}`, 
            background: done ? "var(--accent-color)" : "var(--surface-color)",
            color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold"
          }}>
            {done ? "✓" : ""}
          </span>
        </button>

        {/* Semantic details container */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          {/* Badge line for Aphantasia structure */}
          <div className="flex" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700 }}>
            {/* Status badge */}
            <span style={{ 
              color: done ? "var(--muted-color)" : "var(--accent-color)",
              background: done ? "var(--surface-alt-color)" : "var(--accent-soft-color)",
              padding: "2px 6px", borderRadius: 4
            }}>
              {done ? "[ FAIT ]" : "[ ACTIF ]"}
            </span>

            {/* Category badge */}
            {itemCat && (
              <span style={{ 
                color: itemCat.color,
                background: "var(--surface-alt-color)",
                padding: "2px 6px", borderRadius: 4
              }}>
                [ {itemCat.label.toUpperCase()} ]
              </span>
            )}

            {/* Unsorted badge */}
            {!itemCat && !done && (
              <span style={{ 
                color: "var(--faint-color)",
                background: "var(--surface-alt-color)",
                padding: "2px 6px", borderRadius: 4
              }}>
                [ À TRIER ]
              </span>
            )}

            {/* Link tag */}
            {hasUrl && (
              <span style={{ 
                color: "var(--accent-color)", 
                background: "var(--accent-soft-color)",
                padding: "2px 6px", borderRadius: 4
              }}>
                [ WEB LINK ]
              </span>
            )}

            {/* Subtasks progress */}
            {hasSubtasks && (
              <span style={{ 
                color: "var(--muted-color)", 
                background: "var(--surface-alt-color)",
                padding: "2px 6px", borderRadius: 4
              }}>
                [ ÉTAPES : {doneSubtasks}/{item.subtasks.length} ]
              </span>
            )}
          </div>

          {/* Main Idea Text */}
          <div style={{ 
            fontSize: 15.5, fontWeight: 500, color: "var(--ink-color)", 
            textDecoration: done ? "line-through" : "none",
            lineHeight: 1.45
          }}>
            {renderTextWithLinks(item.text, "var(--accent-color)")}
          </div>

          {/* Subtasks quick render */}
          {hasSubtasks && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {item.subtasks.map(st => (
                <div key={st.id} className="flex items-center" style={{ gap: 6, fontSize: 13, opacity: st.done ? 0.5 : 0.85 }}>
                  <span style={{ 
                    width: 6, height: 6, borderRadius: 999, 
                    background: st.done ? "var(--accent-color)" : "var(--line-color)" 
                  }} />
                  <span style={{ textDecoration: st.done ? "line-through" : "none" }}>{st.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* 🤖 IA Suggestion Button for Unsorted cards */}
          {item.status === "inbox" && item.aiSuggestion && (
            <div style={{ marginTop: 12 }}>
              <button
                className="fx"
                onClick={(e) => {
                  e.stopPropagation();
                  onFile(item.id, item.aiSuggestion);
                }}
                style={{
                  background: "var(--accent-soft-color)", border: `1px dashed var(--accent-color)`,
                  color: "var(--accent-ink-color)", borderRadius: 8, padding: "8px 12px",
                  fontSize: 12.5, fontWeight: 700, minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6
                }}
              >
                🤖 IA : Classer dans « {catOf(item.aiSuggestion)?.label} » ?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inbox View (À Trier)
function InboxView({ inbox, categories, onFile, onOpen, geminiKey, catOf }) {
  if (inbox.length === 0) {
    return (
      <div style={{ marginTop: 20, padding: "40px 20px", textAlign: "center", border: `2px dashed var(--line-color)`, borderRadius: 16, color: "var(--muted-color)" }}>
        <p style={{ margin: 0, fontFamily: "var(--font-disp)", fontWeight: 600, color: "var(--ink-color)", fontSize: 17 }}>[ Votre boîte à trier est vide ]</p>
        <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.45 }}>Saisissez vos idées rapidement sans réfléchir. Vous les retrouverez ici pour les classer plus tard, au calme.</p>
        {!geminiKey && (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--faint-color)" }}>
            Astuce : configurez votre clé API Gemini dans les Options pour activer l'auto-classement par l'IA.
          </p>
        )}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 13.5, color: "var(--muted-color)", margin: "0 0 12px 2px", fontWeight: 600 }}>
        [ {inbox.length} {inbox.length > 1 ? "notes en attente de classement" : "note en attente de classement"} ]
      </p>
      
      <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
        {inbox.map((item) => (
          <IdeaCard 
            key={item.id} 
            item={item} 
            onClick={onOpen}
            onToggleDone={(id) => {
              // Direct toggle
              onOpen(item);
            }}
            onFile={onFile}
            categories={categories}
            catOf={catOf}
          />
        ))}
      </div>
    </div>
  );
}

// ── Ranged View
function RangedView(props) {
  const {
    categories, tab, setTab, catCount, doneCount, filter, setFilter, items, catOf,
    onToggleDone, onOpen, addingCat, setAddingCat, newCat, setNewCat, onAddCat, onRemoveCat,
  } = props;

  const currentCat = catOf(tab);

  return (
    <div style={{ marginTop: 8 }}>
      
      {/* Categories Horizontal Tabs */}
      <div className="flex items-center" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {categories.map((c) => {
          const active = tab === c.id;
          return (
            <button 
              key={c.id} 
              className="fx" 
              onClick={() => setTab(c.id)} 
              aria-pressed={active} 
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: active ? "var(--surface-color)" : "transparent",
                border: `1.5px solid ${active ? c.color : "var(--line-color)"}`,
                color: active ? "var(--ink-color)" : "var(--muted-color)", 
                borderRadius: 999, padding: "8px 14px", fontSize: 14, fontWeight: 600, minHeight: 44,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 999, background: c.color }} aria-hidden="true" />
              {c.label}
              <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 4 }}>{catCount(c.id)}</span>
            </button>
          );
        })}
        
        {/* Completed items tab */}
        <button 
          className="fx" 
          onClick={() => setTab("done")} 
          aria-pressed={tab === "done"} 
          style={{
            background: tab === "done" ? "var(--surface-color)" : "transparent",
            border: `1.5px solid ${tab === "done" ? "var(--muted-color)" : "var(--line-color)"}`,
            color: tab === "done" ? "var(--ink-color)" : "var(--muted-color)", 
            borderRadius: 999, padding: "8px 14px", fontSize: 14, fontWeight: 600, minHeight: 44,
          }}
        >
          [ Fait ] <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 4 }}>{doneCount}</span>
        </button>

        {/* Add Category Trigger */}
        {addingCat ? (
          <span className="flex items-center" style={{ gap: 6 }}>
            <input
              className="fx" 
              autoFocus 
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddCat(); if (e.key === "Escape") { setAddingCat(false); setNewCat(""); } }}
              placeholder="Nom..."
              aria-label="Nom de la nouvelle catégorie"
              style={{ 
                background: "var(--surface-color)", border: `1px solid var(--accent-color)`, 
                borderRadius: 999, padding: "8px 14px", fontSize: 14, width: 110, 
                fontFamily: "var(--font-ui)", minHeight: 44 
              }}
            />
            <button 
              className="fx" 
              onClick={onAddCat}
              style={{
                background: "var(--accent-color)", color: "#fff", border: "none",
                borderRadius: 999, padding: "0 12px", minHeight: 44, fontSize: 13.5, fontWeight: 600
              }}
            >
              Créer
            </button>
            <button 
              className="fx" 
              onClick={() => { setAddingCat(false); setNewCat(""); }}
              style={{
                background: "transparent", border: "none", color: "var(--danger-color)",
                padding: "0 10px", minHeight: 44, fontSize: 13, fontWeight: 600
              }}
            >
              Annuler
            </button>
          </span>
        ) : (
          <button 
            className="fx" 
            onClick={() => setAddingCat(true)} 
            style={{
              background: "transparent", border: `1.5px dashed var(--line-color)`, color: "var(--muted-color)",
              borderRadius: 999, padding: "8px 14px", fontSize: 14, minHeight: 44, fontWeight: 500
            }}
          >
            + Catégorie
          </button>
        )}
      </div>

      {/* Filter and search bar */}
      <input
        className="fx w-full"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrer ou rechercher par mot-clé..."
        aria-label="Rechercher des idées"
        style={{ 
          background: "var(--surface-color)", border: "1px solid var(--line-color)", 
          borderRadius: 12, padding: "12px 14px", fontSize: 15, marginBottom: 16, 
          color: "var(--ink-color)", fontFamily: "var(--font-ui)", minHeight: 44 
        }}
      />

      {/* Section Subtitle */}
      <div className="flex items-center justify-between" style={{ marginBottom: 12, paddingLeft: 4 }}>
        <h2 style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--muted-color)", letterSpacing: "0.01em" }}>
          [ {tab === "done" ? "Historique des tâches terminées" : `Catégorie : ${currentCat?.label}`} · {items.length} ]
        </h2>
        {currentCat?.removable && (
          <button 
            className="fx"
            onClick={() => { if (confirm(`Supprimer la catégorie « ${currentCat.label} » ?\nLes idées non terminées de cette catégorie seront renvoyées dans la boîte « À trier ».`)) onRemoveCat(currentCat.id); }} 
            style={{
              background: "transparent", border: "none", color: "var(--danger-color)", 
              fontSize: 13, fontWeight: 600, minHeight: 44, padding: "0 12px"
            }}
          >
            Supprimer la catégorie
          </button>
        )}
      </div>

      {/* Ranged list */}
      {items.length === 0 ? (
        <div style={{ padding: "40px 18px", border: `2px dashed var(--line-color)`, borderRadius: 16, color: "var(--muted-color)", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>[ Aucun élément ici ]</p>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>
            {tab === "done" ? "Les idées complétées s'afficheront ici." : filter.trim() ? "Aucune idée ne correspond à votre filtre." : "Cette catégorie est vide. Rangez-y une idée depuis « À trier »."}
          </p>
        </div>
      ) : (
        <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <IdeaCard 
              key={item.id} 
              item={item} 
              onClick={onOpen}
              onToggleDone={onToggleDone}
              onFile={() => {}}
              categories={categories}
              catOf={catOf}
            />
          ))}
        </div>
      )}
    </div>
  );
}
