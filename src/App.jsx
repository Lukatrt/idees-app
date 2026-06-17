import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

const CAT_COLORS = ["#3F7150", "#B5673F", "#4E6E8E", "#B98A2E", "#8F2418", "#704E8E"];

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

// Helper to compress images on the client side
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      callback(dataUrl);
    };
  };
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

  const theme = "light";

  const [inputPosition, setInputPosition] = useState(() => {
    return localStorage.getItem("idees-input-position") || "bottom"; // Mobile first default
  });

  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem("idees-gemini-key") || "";
  });

  const [username, setUsername] = useState(() => {
    return localStorage.getItem("idees-username") || "";
  });

  useEffect(() => {
    localStorage.setItem("idees-username", username);
  }, [username]);

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
  const qrCanvasRef = useRef(null);
  const toastTimer = useRef(null);
  const [attachedImage, setAttachedImage] = useState(null);

  // Force light theme
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("idees-theme", "light");
  }, []);

  // Sync settings
  useEffect(() => {
    localStorage.setItem("idees-input-position", inputPosition);
  }, [inputPosition]);

  // ── Sync Engine States & Refs
  const isInitialLoadRef = useRef(true);
  const isIncomingSyncRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isPushingRef = useRef(false);
  const [needsPush, setNeedsPush] = useState(false);
  const needsPushRef = useRef(false);
  const lastLocalMutationTimeRef = useRef(0);
  const [syncStatus, setSyncStatus] = useState("synchronisé"); // "synchronisé" | "hors-ligne" | "synchronisation..."

  const triggerLocalMutation = useCallback(() => {
    lastLocalMutationTimeRef.current = Date.now();
    setNeedsPush(true);
  }, []);

  // Sync needsPushRef with state
  useEffect(() => {
    needsPushRef.current = needsPush;
  }, [needsPush]);

  const latestDataRef = useRef({ ideas, categories });
  useEffect(() => {
    latestDataRef.current = { ideas, categories };
  }, [ideas, categories]);

  const pushToServer = useCallback(async () => {
    if (isPushingRef.current) return;
    isPushingRef.current = true;
    setSyncStatus("synchronisation...");
    const { ideas: ideasToPush, categories: categoriesToPush } = latestDataRef.current;
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: ideasToPush, categories: categoriesToPush }),
      });
      if (!res.ok) throw new Error("HTTP error " + res.status);
      
      const currentData = latestDataRef.current;
      if (JSON.stringify(currentData.ideas) === JSON.stringify(ideasToPush) && 
          JSON.stringify(currentData.categories) === JSON.stringify(categoriesToPush)) {
        setNeedsPush(false);
      }
      setSyncStatus("synchronisé");
    } catch (err) {
      console.error("Push to server failed:", err);
      setSyncStatus("hors-ligne");
    } finally {
      isPushingRef.current = false;
      if (needsPushRef.current) {
        setTimeout(() => {
          pushToServer();
        }, 50);
      }
    }
  }, []);

  const fetchFromServer = useCallback(async () => {
    if (isFetchingRef.current || isPushingRef.current || needsPushRef.current) return;
    isFetchingRef.current = true;
    setSyncStatus("synchronisation...");
    const requestTime = Date.now();
    try {
      const res = await fetch(`/api/data?_=${requestTime}`);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      
      if (lastLocalMutationTimeRef.current > requestTime || needsPushRef.current || isPushingRef.current) {
        console.log("Skipping server update because local changes are pending or newer mutation occurred");
        return;
      }
      
      let dataChanged = false;
      if (data && Array.isArray(data.ideas) && Array.isArray(data.categories)) {
        const { ideas: currentIdeas, categories: currentCategories } = latestDataRef.current;
        if (data.pristine && (currentIdeas.length > 0 || currentCategories.length !== DEFAULT_CATEGORIES.length)) {
          isFetchingRef.current = false;
          await pushToServer();
          return;
        }

        isIncomingSyncRef.current = true;
        setIdeas(prevIdeas => {
          if (JSON.stringify(prevIdeas) !== JSON.stringify(data.ideas)) {
            dataChanged = true;
            return data.ideas;
          }
          return prevIdeas;
        });
        setCategories(prevCategories => {
          if (JSON.stringify(prevCategories) !== JSON.stringify(data.categories)) {
            dataChanged = true;
            return data.categories;
          }
          return prevCategories;
        });
      }
      
      setSyncStatus("synchronisé");
      if (dataChanged) {
        announce("Données synchronisées avec le serveur");
      }
    } catch (err) {
      console.error("Fetch from server failed:", err);
      setSyncStatus("hors-ligne");
    } finally {
      isFetchingRef.current = false;
      isInitialLoadRef.current = false;
    }
  }, [pushToServer]);

  // Auto-save data to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ideas, categories }));
  }, [ideas, categories]);

  // Trigger push when needsPush becomes true
  useEffect(() => {
    if (needsPush) {
      pushToServer();
    }
  }, [needsPush, pushToServer]);

  // ── Sync engine timer & event listeners
  useEffect(() => {
    // Initial fetch on mount
    fetchFromServer();

    // Polling interval
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (needsPush) {
          pushToServer();
        } else {
          fetchFromServer();
        }
      }
    }, 8000);

    // Event listeners
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (needsPush) {
          pushToServer();
        } else {
          fetchFromServer();
        }
      }
    };

    const handleOnline = () => {
      if (needsPush) {
        pushToServer();
      } else {
        fetchFromServer();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [needsPush, pushToServer, fetchFromServer]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Show undo toast
  function showToast(message, undo) {
    clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  // ── Import API Key from URL (QR Code sync)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const importKey = params.get("importKey");
      if (importKey) {
        setGeminiKey(importKey);
        localStorage.setItem("idees-gemini-key", importKey);
        
        // Remove query parameter from address bar
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        
        announce("Clé API Gemini importée avec succès !");
        showToast("Clé API Gemini importée avec succès !");
      }
    } catch (e) {
      console.error("Failed to parse URL query parameters", e);
    }
  }, []);

  // ── Generate QR Code for sharing Gemini API Key
  useEffect(() => {
    if (showSettings && qrCanvasRef.current && geminiKey.trim()) {
      // Import URL linking back to the current application address
      const importUrl = `${window.location.origin}/?importKey=${encodeURIComponent(geminiKey.trim())}`;
      QRCode.toCanvas(qrCanvasRef.current, importUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: "#1E2219", // Dark color (high contrast black/dark green)
          light: "#FFFFFF" // White background (optimal scanning reliability)
        }
      }, (error) => {
        if (error) console.error("Failed to generate QR Code", error);
      });
    }
  }, [geminiKey, showSettings]);

  // Helper to suggest category using Gemini
  async function runAiCategorization(ideaId, ideaText) {
    if (!geminiKey.trim()) return;
    try {
      const catLabels = categories.map(c => c.label);
      const prompt = `Vous êtes un assistant IA spécialisé dans l'organisation d'idées pour une personne aphantasique. Votre rôle est de classer l'idée fournie dans l'une des catégories configurées : [${catLabels.join(", ")}].

Directives strictes :
1. Choisissez uniquement et exactement l'une des catégories de la liste fournie.
2. Si l'idée ne correspond à aucune catégorie de façon évidente et directe, renvoyez null. Ne faites pas d'hypothèses farfelues ou indirectes.
3. Ignorez les mots vides ou expressions d'hésitation. Concentrez-vous sur le sens concret.
4. Répondez UNIQUEMENT sous forme d'un objet JSON valide contenant la clé "suggestedCategory". Aucun texte explicatif ou salutation autour du JSON.

Exemple d'idées et classifications attendues :
- Catégories : [Maison, Travaux, À faire]
- Idée : "repeindre la cuisine et fixer l'étagère" -> {"suggestedCategory": "Travaux"}
- Idée : "appeler le plombier pour la fuite d'eau" -> {"suggestedCategory": "Maison"}
- Idée : "penser à acheter du pain" -> {"suggestedCategory": "À faire"}
- Idée : "idée de startup de vente de chaussures en ligne" -> {"suggestedCategory": null}

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
    if (!v && !attachedImage) return;
    const newId = uid();
    const newIdeaObj = { 
      id: newId, 
      text: v || "[ Capture d'écran seule ]", 
      createdAt: Date.now(), 
      status: "inbox", 
      category: null,
      aiSuggestion: null,
      subtasks: [],
      image: attachedImage || null,
      author: username.trim() || "Anonyme"
    };

    setIdeas((p) => [newIdeaObj, ...p]);
    triggerLocalMutation();
    setText("");
    setAttachedImage(null);
    announce("Idée ajoutée dans la boîte à trier");
    if (inputRef.current) inputRef.current.focus();

    // Trigger AI categorization in background
    if (geminiKey.trim() && v) {
      runAiCategorization(newId, v);
    }
  }

  function fileIdea(id, catId) {
    const cat = categories.find((c) => c.id === catId);
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: catId, aiSuggestion: null } : i)));
    triggerLocalMutation();
    announce(cat ? `Rangé dans ${cat.label}` : "Rangé");
    if (activeIdea && activeIdea.id === id) {
      setActiveIdea(prev => ({ ...prev, status: "classed", category: catId, aiSuggestion: null }));
    }
  }

  function moveIdea(id, target) {
    if (target === "__inbox") {
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "inbox", category: null } : i)));
      triggerLocalMutation();
      announce("Renvoyé dans À trier");
      if (activeIdea && activeIdea.id === id) {
        setActiveIdea(prev => ({ ...prev, status: "inbox", category: null }));
      }
    } else {
      const cat = categories.find((c) => c.id === target);
      setIdeas((p) => p.map((i) => (i.id === id ? { ...i, status: "classed", category: target } : i)));
      triggerLocalMutation();
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
    triggerLocalMutation();
  }

  function removeIdea(id) {
    const idx = ideas.findIndex((i) => i.id === id);
    const removed = ideas[idx];
    if (!removed) return;
    setIdeas((p) => p.filter((i) => i.id !== id));
    triggerLocalMutation();
    setActiveIdea(null);
    announce("Idée supprimée");
    showToast("Idée supprimée", () => {
      setIdeas((p) => {
        const copy = p.slice();
        copy.splice(Math.min(idx, copy.length), 0, removed);
        return copy;
      });
      triggerLocalMutation();
      setToast(null);
      announce("Suppression annulée");
    });
  }

  function saveIdeaText(id, newText) {
    const v = newText.trim();
    if (!v) return;
    setIdeas((p) => p.map((i) => (i.id === id ? { ...i, text: v } : i)));
    triggerLocalMutation();
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
    triggerLocalMutation();
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
    triggerLocalMutation();
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
    triggerLocalMutation();
    announce("Sous-tâche supprimée");
  }

  // ── AI Clean up & Restructuring
  async function runAiCleanup(idea) {
    if (!geminiKey.trim()) return;
    setAiLoading(true);
    setAiError("");
    announce("IA structure la note...");
    try {
      const prompt = `Vous êtes un assistant IA qui structure des notes prises à la volée pour une personne ayant des difficultés à visualiser mentalement ses tâches (aphantasie). Votre mission est de clarifier, corriger l'orthographe et structurer la note fournie, sans en modifier le sens.

Règles de mise en forme strictes :
1. Reformulez la note principale pour la rendre propre, claire et bien écrite en français, sans fioritures.
2. Identifiez s'il y a des actions, étapes ou sous-tâches concrètes à effectuer. Si oui, extrayez-les sous forme d'une liste de phrases courtes et directes (maximum 5 mots par tâche, commençant par un verbe d'action à l'infinitif).
3. Si la note ne contient pas d'étapes de travail ou d'actions multiples, la liste de tâches (tasks) doit être vide.
4. Vous devez répondre UNIQUEMENT sous forme d'un objet JSON valide contenant deux clés :
   - "text" : (String) La note principale nettoyée et corrigée.
   - "tasks" : (Tableau de chaînes) Les phrases courtes des sous-tâches identifiées (ou tableau vide si aucune tâche).
5. Ne mettez aucun commentaire introductif ou explicatif, pas de blocs markdown de code (\`\`\`json ... \`\`\`), uniquement le JSON brut.

Exemple 1 :
- Entrée : "acheter peinture blanche rouleau pinceaux appeler jean pour devis cuisine"
- Sortie : {
    "text": "Acheter le matériel de peinture et appeler Jean pour le devis de la cuisine.",
    "tasks": ["Acheter de la peinture blanche", "Prendre un rouleau et des pinceaux", "Appeler Jean pour le devis"]
  }

Exemple 2 :
- Entrée : "penser à ranger le garage samedi matin s'il fait beau"
- Sortie : {
    "text": "Prévoir de ranger le garage ce samedi matin s'il fait beau.",
    "tasks": ["Ranger le garage"]
  }

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
        triggerLocalMutation();
        announce("Note structurée par l'IA avec succès !");
      }
    } catch (err) {
      console.error(err);
      setAiError("Erreur lors de l'appel IA. Vérifiez votre clé API dans les options.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── Backup Export / Import (Serverless sync)
  function exportData() {
    try {
      const dataStr = JSON.stringify({ ideas, categories });
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `idees-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      announce("Données exportées sous forme de fichier JSON");
      showToast("Sauvegarde exportée avec succès !");
    } catch (e) {
      showToast("Erreur lors de l'exportation");
    }
  }

  function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed.ideas) && Array.isArray(parsed.categories)) {
          setIdeas(parsed.ideas);
          setCategories(parsed.categories);
          triggerLocalMutation();
          announce("Sauvegarde importée avec succès !");
          showToast("Données importées avec succès !");
        } else {
          showToast("Format de fichier invalide");
        }
      } catch (err) {
        showToast("Erreur de lecture : fichier corrompu");
      }
    };
  }

  // ── Categories Management
  function addCategory() {
    const label = newCat.trim();
    if (!label) return;
    const color = CAT_COLORS[categories.length % CAT_COLORS.length];
    const cat = { id: uid(), label, color, removable: true };
    setCategories((p) => [...p, cat]);
    triggerLocalMutation();
    setNewCat(""); setAddingCat(false); setTab(cat.id); announce(`Catégorie ${label} créée`);
  }

  function removeCategory(catId) {
    setIdeas((p) => p.map((i) => (i.category === catId && i.status !== "done" ? { ...i, category: null, status: "inbox" } : i)));
    setCategories((p) => p.filter((c) => c.id !== catId));
    triggerLocalMutation();
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
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>

      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{live}</div>

      {/* ── Main Container ── */}
      <div className="mx-auto flex" style={{ maxWidth: 680, width: "100%", flexDirection: "column", height: "100%", overflow: "hidden", padding: "0 16px" }}>
        
        {/* Header */}
        <header className="flex items-center justify-between" style={{ paddingTop: 20, paddingBottom: 12, flexShrink: 0 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <h1 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", margin: 0, color: "var(--ink-color)" }}>idées</h1>
            <button 
              onClick={() => {
                if (needsPush) {
                  pushToServer();
                } else {
                  fetchFromServer();
                }
              }}
              className="fx" 
              style={{
                background: syncStatus === "synchronisé" ? "var(--accent-soft-color)" : syncStatus === "hors-ligne" ? "rgba(195, 75, 60, 0.12)" : "var(--surface-alt-color)",
                border: `1px solid ${syncStatus === "synchronisé" ? "var(--accent-color)" : syncStatus === "hors-ligne" ? "var(--danger-color)" : "var(--line-color)"}`,
                borderRadius: 999, 
                height: 40, 
                padding: "0 14px", 
                fontSize: 12.5, 
                fontWeight: 700, 
                color: syncStatus === "synchronisé" ? "var(--accent-ink-color)" : syncStatus === "hors-ligne" ? "var(--danger-color)" : "var(--ink-color)",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                boxShadow: "0 2px 8px var(--shadow-color)"
              }}
              aria-label={`Statut de synchronisation: ${syncStatus}. Cliquer pour rafraîchir.`}
            >
              <span 
                className={syncStatus === "synchronisation..." ? "pulse-animation" : ""}
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: 999, 
                  background: syncStatus === "synchronisé" ? "var(--accent-color)" : syncStatus === "hors-ligne" ? "var(--danger-color)" : "var(--muted-color)",
                  display: "inline-block"
                }} 
              />
              <span>
                {syncStatus === "synchronisé" ? "Synchronisé" : syncStatus === "hors-ligne" ? "Hors-ligne" : "Sync..."}
              </span>
            </button>
          </div>
          <div className="flex" style={{ gap: 8 }}>
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
        <div className="flex" style={{ gap: 8, paddingBottom: 14, flexShrink: 0 }}>
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

        {/* Scrollable list area */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", paddingBottom: inputPosition === "bottom" ? 100 : 24, WebkitOverflowScrolling: "touch" }}>
          {/* ── Instanteous Capture Field (TOP POSITION) ── */}
          {inputPosition === "top" && (
            <div style={{ paddingTop: 4, paddingBottom: 16 }}>
              <div 
                className="premium-card" 
                style={{
                  padding: "6px", 
                  borderRadius: 24, 
                  border: "1px solid var(--line-color)",
                  display: "flex", 
                  flexDirection: "column",
                  gap: 0,
                  maxWidth: 650,
                  margin: "0 auto"
                }}
              >
                {attachedImage && (
                  <div className="flex items-center" style={{ gap: 10, padding: "8px 12px 6px", borderBottom: "1px solid var(--line-color)" }}>
                    <img src={attachedImage} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-color)" }} />
                    <span style={{ fontSize: 13, color: "var(--muted-color)", fontWeight: 500 }}>Capture d'écran prête</span>
                    <button 
                      onClick={() => setAttachedImage(null)} 
                      className="fx"
                      style={{ background: "transparent", border: "none", color: "var(--danger-color)", fontWeight: 700, fontSize: 13, cursor: "pointer", marginLeft: "auto", minHeight: 32, padding: "4px 8px" }}
                    >
                      [ ✕ Retirer ]
                    </button>
                  </div>
                )}
                <div className="flex items-center w-full" style={{ gap: 8 }}>
                  <label
                    className="fx"
                    style={{
                      background: "transparent",
                      color: "var(--muted-color)",
                      border: "none",
                      borderRadius: 20,
                      padding: "0 10px",
                      fontSize: 13.5,
                      fontWeight: 600,
                      minHeight: 40,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer"
                    }}
                  >
                    <span>📷 Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          compressImage(file, (base64) => {
                            setAttachedImage(base64);
                          });
                        }
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                  <input
                    ref={inputRef}
                    className="fx w-full"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }}
                    placeholder="Noter une idée sans réfléchir..."
                    aria-label="Saisir une nouvelle idée"
                    style={{
                      flex: 1, 
                      background: "transparent", 
                      border: "none", 
                      borderRadius: 16,
                      padding: "12px 12px", 
                      fontSize: 16, 
                      color: "var(--ink-color)", 
                      fontFamily: FONT_UI, 
                      minHeight: 44,
                      outline: "none"
                    }}
                  />
                  <button
                    className="fx"
                    onClick={addIdea}
                    disabled={!text.trim() && !attachedImage}
                    style={{
                      background: (text.trim() || attachedImage) ? "var(--accent-color)" : "transparent",
                      color: (text.trim() || attachedImage) ? "#fff" : "var(--faint-color)",
                      border: "none", 
                      borderRadius: 20, 
                      padding: "0 18px", 
                      fontSize: 14, 
                      fontWeight: 700,
                      minHeight: 40, 
                      fontFamily: FONT_DISP,
                    }}
                  >
                    Ajouter
                  </button>
                </div>
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
      </div>

      {/* ── Instanteous Capture Field (BOTTOM FLOATING POSITION - default) ── */}
      {inputPosition === "bottom" && (
        <div 
          style={{
            position: "absolute", 
            bottom: "calc(16px + env(safe-area-inset-bottom))", 
            left: 16, 
            right: 16, 
            zIndex: 10,
            boxShadow: "0 8px 32px var(--shadow-color)"
          }}
        >
          <div 
            className="glass-panel" 
            style={{
              padding: "6px", 
              borderRadius: 24, 
              border: "1px solid var(--glass-border)",
              display: "flex", 
              flexDirection: "column",
              gap: 0,
              maxWidth: 650,
              margin: "0 auto"
            }}
          >
            {attachedImage && (
              <div className="flex items-center" style={{ gap: 10, padding: "8px 12px 6px", borderBottom: "1px solid var(--line-color)" }}>
                <img src={attachedImage} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-color)" }} />
                <span style={{ fontSize: 13, color: "var(--muted-color)", fontWeight: 500 }}>Capture d'écran prête</span>
                <button 
                  onClick={() => setAttachedImage(null)} 
                  className="fx"
                  style={{ background: "transparent", border: "none", color: "var(--danger-color)", fontWeight: 700, fontSize: 13, cursor: "pointer", marginLeft: "auto", minHeight: 32, padding: "4px 8px" }}
                >
                  [ ✕ Retirer ]
                </button>
              </div>
            )}
            <div className="flex items-center w-full" style={{ gap: 8 }}>
              <label
                className="fx"
                style={{
                  background: "transparent",
                  color: "var(--muted-color)",
                  border: "none",
                  borderRadius: 20,
                  padding: "0 10px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  minHeight: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer"
                }}
              >
                <span>📷 Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      compressImage(file, (base64) => {
                        setAttachedImage(base64);
                      });
                    }
                  }}
                  style={{ display: "none" }}
                />
              </label>
              <input
                ref={inputRef}
                className="fx w-full"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }}
                placeholder="Noter une idée sans réfléchir..."
                aria-label="Saisir une nouvelle idée"
                style={{
                  flex: 1, 
                  background: "transparent", 
                  border: "none", 
                  borderRadius: 16,
                  padding: "12px 12px", 
                  fontSize: 16, 
                  color: "var(--ink-color)", 
                  fontFamily: FONT_UI, 
                  minHeight: 44,
                  outline: "none"
                }}
              />
              <button
                className="fx"
                onClick={addIdea}
                disabled={!text.trim() && !attachedImage}
                style={{
                  background: (text.trim() || attachedImage) ? "var(--accent-color)" : "transparent",
                  color: (text.trim() || attachedImage) ? "#fff" : "var(--faint-color)",
                  border: "none", 
                  borderRadius: 20, 
                  padding: "0 18px", 
                  fontSize: 14, 
                  fontWeight: 700,
                  minHeight: 40, 
                  fontFamily: FONT_DISP,
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo Toast ── */}
      {toast && (
        <div className="idea-in" style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: inputPosition === "bottom" ? 96 : 22,
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
              width: "100%", maxWidth: 500, padding: 24, margin: "16px", 
              background: "var(--surface-color)", border: "1px solid var(--line-color)",
              maxHeight: "90vh", overflowY: "auto"
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

            {/* Username Config */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                Votre pseudonyme (pour identifier vos ajouts)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: Luka, Marie..."
                className="fx w-full"
                style={{
                  minHeight: 44, padding: "8px 12px", fontSize: 14.5, 
                  borderRadius: 8, border: "1px solid var(--line-color)", 
                  background: "var(--surface-color)", color: "var(--ink-color)"
                }}
              />
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

            {/* Backup & Sync section */}
            <div style={{ marginBottom: 20, borderTop: "1px solid var(--line-color)", paddingTop: 16 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                Sauvegarder & Synchroniser les idées
              </label>
              <div className="flex" style={{ gap: 8, marginBottom: 12 }}>
                <button
                  onClick={exportData}
                  className="fx"
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--line-color)",
                    background: "var(--surface-alt-color)", color: "var(--ink-color)",
                    fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  Exporter (JSON)
                </button>
                <label
                  className="fx"
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--line-color)",
                    background: "var(--surface-alt-color)", color: "var(--ink-color)",
                    fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", cursor: "pointer"
                  }}
                >
                  Importer (JSON)
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
              <span style={{ fontSize: 12, color: "var(--faint-color)" }}>
                Permet de transférer manuellement vos idées d'un appareil à un autre sous forme de fichier de sauvegarde.
              </span>
            </div>

            {/* QR Code sharing section */}
            {geminiKey.trim() && (
              <div style={{ marginBottom: 20, textAlign: "center", borderTop: "1px solid var(--line-color)", paddingTop: 16 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--muted-color)", marginBottom: 8 }}>
                  Partager ma clé API vers l'iPhone (QR Code)
                </span>
                <div style={{ background: "#fff", padding: 12, borderRadius: 12, display: "inline-block", border: "1px solid var(--line-color)" }}>
                  <canvas ref={qrCanvasRef} style={{ display: "block", width: 180, height: 180 }} />
                </div>
                <span style={{ display: "block", fontSize: 12, color: "var(--faint-color)", marginTop: 6 }}>
                  Scannez ce code avec l'appareil photo de votre iPhone. Safari l'ouvrira et configurera la clé automatiquement !
                </span>
              </div>
            )}

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
            background: "rgba(30, 34, 25, 0.3)", 
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column", justifyContent: "flex-end"
          }}
          onClick={closeDetails}
        >
          <div 
            className="slide-up" 
            style={{
              width: "100%", maxWidth: 680, alignSelf: "center",
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              border: "1px solid rgba(255, 255, 255, 0.55)", 
              borderBottom: "none",
              background: "linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.65) 100%)",
              backdropFilter: "blur(40px) saturate(210%)",
              WebkitBackdropFilter: "blur(40px) saturate(210%)",
              padding: "24px 20px calc(24px + env(safe-area-inset-bottom))",
              maxHeight: "90vh", overflowY: "auto",
              boxShadow: "inset 0 1.5px 0 0 rgba(255, 255, 255, 0.75), 0 -15px 45px rgba(30, 34, 25, 0.15)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* iOS Drag Handle */}
            <div style={{
              width: 36,
              height: 5,
              borderRadius: 2.5,
              background: "var(--line-color)",
              margin: "0 auto 16px",
              opacity: 0.8
            }} />

            {/* Bottom Sheet Header */}
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--faint-color)" }}>
                  {activeIdea.status === "inbox" && "[ Statut : À Classer ]"}
                  {activeIdea.status === "classed" && `[ Statut : Classé dans ${catOf(activeIdea.category)?.label} ]`}
                  {activeIdea.status === "done" && "[ Statut : Terminé ]"}
                </span>
                <div style={{ fontSize: 12, color: "var(--faint-color)", marginTop: 2 }}>
                  Ajouté par {activeIdea.author || "Anonyme"} le {new Date(activeIdea.createdAt).toLocaleDateString("fr-FR")} à {new Date(activeIdea.createdAt).toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' })}
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

            {/* Screenshot attachment management inside Bottom Sheet */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--muted-color)" }}>
                [ Capture d'écran ]
              </label>
              {activeIdea.image ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line-color)", background: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "center", padding: 8 }}>
                    <img 
                      src={activeIdea.image} 
                      alt="Capture d'écran" 
                      style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8 }} 
                    />
                  </div>
                  <button
                    className="fx"
                    onClick={() => {
                      const updated = { ...activeIdea, image: null };
                      setActiveIdea(updated);
                      setIdeas(prev => prev.map(i => i.id === activeIdea.id ? updated : i));
                      triggerLocalMutation();
                      announce("Capture d'écran retirée");
                    }}
                    style={{
                      minHeight: 44, borderRadius: 12, border: "1.5px solid var(--danger-color)",
                      background: "transparent", color: "var(--danger-color)",
                      fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                    }}
                  >
                    [ ✕ Retirer la capture d'écran ]
                  </button>
                </div>
              ) : (
                <div>
                  <label 
                    className="fx"
                    style={{
                      minHeight: 44, borderRadius: 12, border: "1.5px dashed var(--line-color)",
                      background: "var(--surface-alt-color)", color: "var(--ink-color)",
                      fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 8
                    }}
                  >
                    <span>📷 Joindre une capture d'écran</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          compressImage(file, (base64) => {
                            const updated = { ...activeIdea, image: base64 };
                            setActiveIdea(updated);
                            setIdeas(prev => prev.map(i => i.id === activeIdea.id ? updated : i));
                            triggerLocalMutation();
                            announce("Capture d'écran ajoutée");
                          });
                        }
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              )}
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

      {/* ── Username Force Modal Overlay ── */}
      {!username.trim() && (
        <div 
          className="fade-in" 
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, right: 0, zIndex: 60,
            background: "rgba(30, 34, 25, 0.4)", 
            backdropFilter: "blur(15px)",
            WebkitBackdropFilter: "blur(15px)",
            display: "flex", justifyContent: "center", alignItems: "center"
          }}
        >
          <div 
            className="slide-up" 
            style={{
              width: "100%", maxWidth: 400, padding: 28, margin: "16px", 
              background: "linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.7) 100%)",
              border: "1px solid rgba(255, 255, 255, 0.55)",
              borderRadius: 24,
              boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 20px 50px rgba(30, 34, 25, 0.15)",
              textAlign: "center"
            }}
          >
            <h2 style={{ fontFamily: FONT_DISP, fontWeight: 700, fontSize: 22, margin: "0 0 12px 0", color: "var(--ink-color)" }}>
              [ Choisir un pseudonyme ]
            </h2>
            <p style={{ fontSize: 14.5, color: "var(--muted-color)", lineHeight: 1.5, margin: "0 0 20px 0" }}>
              Pour utiliser l'application de synchronisation en temps réel, veuillez renseigner un pseudonyme. Vos ajouts et modifications y seront associés.
            </p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const val = e.target.elements.pseudoInput.value.trim();
              if (val) {
                setUsername(val);
              }
            }}>
              <input
                name="pseudoInput"
                type="text"
                autoFocus
                placeholder="Ex: Luka, Marie, Papa..."
                className="fx w-full"
                style={{
                  minHeight: 44, padding: "8px 14px", fontSize: 16, 
                  borderRadius: 12, border: "1px solid var(--line-color)", 
                  background: "var(--surface-color)", color: "var(--ink-color)",
                  marginBottom: 16, textAlign: "center", outline: "none"
                }}
              />
              <button
                type="submit"
                className="fx w-full"
                style={{
                  background: "var(--accent-color)", color: "#fff", border: "none",
                  borderRadius: 12, minHeight: 44, fontWeight: 700, fontSize: 15, cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(47, 107, 67, 0.2)"
                }}
              >
                Commencer à utiliser l'application
              </button>
            </form>
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

  const isInstaReel = item.text.includes("instagram.com/reel/") || item.text.includes("instagram.com/p/");

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

            {/* Author badge */}
            <span style={{ 
              color: "var(--faint-color)",
              background: "var(--surface-alt-color)",
              padding: "2px 6px", borderRadius: 4
            }}>
              [ PAR : {(item.author || "Anonyme").toUpperCase()} ]
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

            {/* Instagram Reel badge */}
            {isInstaReel && (
              <span style={{ 
                color: "#D62976", 
                background: "rgba(214, 41, 118, 0.1)",
                padding: "2px 6px", borderRadius: 4
              }}>
                [ INSTA REEL ]
              </span>
            )}

            {/* Link tag */}
            {hasUrl && !isInstaReel && (
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

          {/* Screenshot attachment preview */}
          {item.image && (
            <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line-color)", background: "var(--surface-alt-color)" }}>
              <img 
                src={item.image} 
                alt="Capture d'écran" 
                style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} 
              />
            </div>
          )}

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
      <div 
        className="flex items-center no-scrollbar" 
        style={{ 
          overflowX: "auto", 
          flexWrap: "nowrap", 
          gap: 8, 
          marginBottom: 16,
          paddingBottom: 6,
          width: "100%",
          WebkitOverflowScrolling: "touch"
        }}
      >
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
