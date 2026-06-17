const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8289;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_CATEGORIES = [
  { id: "maison", label: "Maison", color: "#3F7150", removable: false },
  { id: "travaux", label: "Travaux", color: "#B5673F", removable: false },
  { id: "afaire", label: "À faire", color: "#4E6E8E", removable: false },
  { id: "atrouver", label: "À trouver", color: "#B98A2E", removable: false },
];

app.use(express.json({ limit: '10mb' }));

// Disable caching for API calls
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  next();
});

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── API Endpoints
app.get('/api/data', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
      return res.json(JSON.parse(fileContent));
    }
    // Return empty database if it doesn't exist yet
    return res.json({ ideas: [], categories: DEFAULT_CATEGORIES, pristine: true });
  } catch (err) {
    console.error("Error reading database file", err);
    return res.status(500).json({ error: "Failed to read database" });
  }
});

app.post('/api/data', (req, res) => {
  try {
    const { ideas, categories } = req.body;
    if (!Array.isArray(ideas) || !Array.isArray(categories)) {
      return res.status(400).json({ error: "Invalid data format" });
    }
    
    fs.writeFileSync(DATA_FILE, JSON.stringify({ ideas, categories }, null, 2), 'utf8');
    return res.json({ status: "ok" });
  } catch (err) {
    console.error("Error writing database file", err);
    return res.status(500).json({ error: "Failed to save database" });
  }
});

app.post('/api/external-add', (req, res) => {
  try {
    const { text, author } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'text' parameter" });
    }

    let db = { ideas: [], categories: DEFAULT_CATEGORIES };
    if (fs.existsSync(DATA_FILE)) {
      const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
      db = JSON.parse(fileContent);
    }

    const newId = Math.random().toString(36).substring(2, 10);
    const newIdea = {
      id: newId,
      text: text.trim(),
      createdAt: Date.now(),
      status: "inbox",
      category: null,
      aiSuggestion: null,
      subtasks: [],
      image: null,
      author: (author || "Raccourci").trim()
    };

    db.ideas = [newIdea, ...db.ideas];
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');

    return res.json({ status: "ok", idea: newIdea });
  } catch (err) {
    console.error("Error in external-add endpoint", err);
    return res.status(500).json({ error: "Failed to save data" });
  }
});

// ── Serve React Static Files in Production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback all other GET requests to index.html for React Router / SPA support
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running in production mode on http://0.0.0.0:${PORT}`);
});
