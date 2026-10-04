(function () {      
  "use strict";
  const LEGACY_LS = "noteflow_tw_v1";
  const THEME_LS = "noteflow_theme";
  const DB_NAME = "noteflow";
  const DB_VERSION = 1;
  const DB_STORE = "appData";
  const MAX_ATTACHMENT_BYTES = 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  const state = {
    notes: [], activeId: null, draft: null, editingId: null, editorMode: "view", deleteTargetIds: null, log: [], lastSync: null,
    syncPending: false, revision: 0, syncInFlight: false, selectionMode: false, selectedIds: new Set(),
    formulaKeyboardOpen: false, formulaKeyboardMode: "math", simpleShift: false, conflictNoteId: null,
    editorReturnFocus: null, deleteReturnFocus: null,
    serverConnected: false, hasLocalSnapshot: false, database: null, storageMode: "indexeddb"
  };
  const NOTE_CATEGORIES = ["Daily", "Plan", "Study", "Important", "Work", "Personal", "Memories"];
  const CATEGORY_STYLES = {
    Daily: "bg-emerald-50 text-emerald-700",
    Plan: "bg-sky-50 text-sky-700",
    Study: "bg-violet-50 text-violet-700",
    Important: "bg-rose-50 text-rose-700",
    Work: "bg-amber-50 text-amber-700",
    Personal: "bg-slate-100 text-slate-600",
    Memories: "bg-fuchsia-50 text-fuchsia-700"
  };
  const FORMULA_KEYS = {
    math: [
      { label: "²", value: "²" }, { label: "³", value: "³" }, { label: "ⁿ", value: "ⁿ" },
      { label: "√( )", value: "√( )", cursor: 2 }, { label: "∛( )", value: "∛( )", cursor: 2 },
      { label: "ⁿ√( )", value: "ⁿ√( )", cursor: 3 }, { label: "( )²", value: "( )²", cursor: 1 },
      { label: "( )³", value: "( )³", cursor: 1 }, { label: "( )ⁿ", value: "( )ⁿ", cursor: 1 },
      { label: "( )/( )", value: "( )/( )", cursor: 1 }, { label: "±", value: "±" },
      { label: "×", value: "×" }, { label: "÷", value: "÷" }, { label: "≠", value: "≠" },
      { label: "≤", value: "≤" }, { label: "≥", value: "≥" }, { label: "≈", value: "≈" },
      { label: "∝", value: "∝" }, { label: "∠", value: "∠" }, { label: "∈", value: "∈" },
      { label: "π", value: "π" }, { label: "θ", value: "θ" }, { label: "α", value: "α" },
      { label: "β", value: "β" }, { label: "Δ", value: "Δ" }, { label: "∑", value: "∑" },
      { label: "∏", value: "∏" }, { label: "∫", value: "∫" }, { label: "∂", value: "∂" },
      { label: "∇", value: "∇" }, { label: "∞", value: "∞" },
      { label: "₀₁₂₃", value: "₀₁₂₃" }, { label: "₄₅₆₇₈₉", value: "₄₅₆₇₈₉" }
    ],
    chemistry: [
      { label: "H₂O", value: "H₂O" }, { label: "CO₂", value: "CO₂" },
      { label: "O₂", value: "O₂" }, { label: "N₂", value: "N₂" },
      { label: "CH₄", value: "CH₄" }, { label: "NH₃", value: "NH₃" },
      { label: "H₂SO₄", value: "H₂SO₄" }, { label: "CaCO₃", value: "CaCO₃" },
      { label: "Na⁺", value: "Na⁺" }, { label: "Cl⁻", value: "Cl⁻" },
      { label: "e⁻", value: "e⁻" }, { label: "⁺", value: "⁺" }, { label: "⁻", value: "⁻" },
      { label: "→", value: "→" }, { label: "⇌", value: "⇌" }, { label: "↑", value: "↑" },
      { label: "↓", value: "↓" }, { label: "°C", value: "°C" },
      { label: "(s)", value: "(s)" }, { label: "(l)", value: "(l)" },
      { label: "(g)", value: "(g)" }, { label: "(aq)", value: "(aq)" }
    ]
  };
  let imageViewerTrigger = null;
  let bodySelection = { start: 0, end: 0 };

  const now = () => Date.now();
  const isOnline = () => navigator.onLine;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function relTime(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 45) return "just now";
    if (d < 3600) return Math.floor(d / 60) + "m ago";
    if (d < 86400) return Math.floor(d / 3600) + "h ago";
    return Math.floor(d / 86400) + "d ago";
  }
  const announce = (msg) => { $("srAnnounce").textContent = msg; };
  function applyTheme(isDark) {
    document.body.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    const button = $("themeToggle");
    const darkMode = isDark;
    button.setAttribute("aria-pressed", String(darkMode));
    button.setAttribute("aria-label", "Switch to " + (darkMode ? "light" : "dark") + " theme");
    button.title = "Switch to " + (darkMode ? "light" : "dark") + " theme";
    $("themeToggleLabel").textContent = darkMode ? "Light mode" : "Dark mode";
    button.querySelector("svg").innerHTML = darkMode
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
      : '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>';
  }
  function loadTheme() {
    try {
      return localStorage.getItem(THEME_LS) === "dark";
    } catch (error) {
      console.error("Could not load the saved theme preference:", error);
      return false;
    }
  }
  function setPageInert(inert) {
    ["appHeader", "mainContent", "addBtn", "statusBar"].forEach((id) => { $(id).inert = inert; });
  }
  function focusNoteCard(id) {
    const button = Array.from(document.querySelectorAll("[data-note-id]"))
      .find((item) => item.dataset.noteId === id);
    (button || $("addBtn")).focus();
  }
  function getTopModal() {
    if (!$("imageViewer").classList.contains("hidden")) return $("imageViewer");
    if (!$("deleteConfirm").classList.contains("hidden")) return $("deleteConfirm");
    if (!$("editor").classList.contains("hidden")) return $("editor");
    return null;
  }
  function trapModalFocus(event) {
    const modal = getTopModal();
    if (!modal || event.key !== "Tab") return;
    const focusable = Array.from(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && (activeIndex === 0 || activeIndex === -1)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeIndex === focusable.length - 1 || activeIndex === -1)) {
      event.preventDefault();
      first.focus();
    }
  }

  function seed() {
    const t = now();
    return [
      { id: "n1", title: "Trip to the village", body: "Train at 6pm. Signal drops after the last station — keep writing, it saves offline.", ts: t - 2520000, pinned: true, pending: false, category: "Plan", conflicted: false },
      { id: "n2", title: "Hackathon: ALGOTHON'26", body: "Offline-first notes app. Focus: clean UI, clear sync status, and conflict handling without silent overwrite.", ts: t - 540000, pinned: false, pending: false, category: "Study", conflicted: false },
      { id: "n3", title: "Groceries", body: "Milk, atta, dal, tomatoes, ginger.", ts: t - 18000000, pinned: false, pending: false, category: "Daily", conflicted: false },
    ];
  }

  function defaultCategory(note) {
    const content = (note.title + " " + note.body).toLowerCase();
    if (/grocery|groceries|shopping|daily/.test(content)) return "Daily";
    if (/trip|travel|plan|village/.test(content)) return "Plan";
    if (/study|school|class|course|hackathon/.test(content)) return "Study";
    if (/important|urgent|deadline/.test(content)) return "Important";
    if (/work|project|meeting/.test(content)) return "Work";
    return "Personal";
  }

  let databasePromise;
  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not supported by this browser."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          request.result.createObjectStore(DB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB."));
      request.onblocked = () => reject(new Error("IndexedDB is blocked by another open NoteFlow tab."));
    });
    return databasePromise;
  }

  function readDatabaseRecord(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not read NoteFlow data."));
    });
  }

  async function load() {
    let migratedNotes = false;
    let notesRecord = null;
    let dirtyRecord = null;
    let syncRecord = null;
    try {
      state.database = await openDatabase();
      const transaction = state.database.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      [notesRecord, dirtyRecord, syncRecord] = await Promise.all([
        readDatabaseRecord(store, "notes"),
        readDatabaseRecord(store, "syncPending"),
        readDatabaseRecord(store, "lastSync")
      ]);
      state.storageMode = "indexeddb";
    } catch (error) {
      state.storageMode = "localstorage";
      console.error("Could not open IndexedDB; using localStorage fallback:", error);
    }

    if (notesRecord && Array.isArray(notesRecord.value)) {
      state.notes = notesRecord.value;
      state.hasLocalSnapshot = true;
      state.syncPending = !!(dirtyRecord && dirtyRecord.value) || state.notes.some((note) => note.pending);
      const storedLastSync = Number(syncRecord && syncRecord.value);
      state.lastSync = Number.isFinite(storedLastSync) && storedLastSync > 0 ? storedLastSync : null;
    } else {
      try {
        const raw = localStorage.getItem(LEGACY_LS);
        state.hasLocalSnapshot = raw !== null;
        state.notes = raw ? JSON.parse(raw) : seed();
        const storedLastSync = Number(localStorage.getItem(LEGACY_LS + "_serverLastSync") ||
          localStorage.getItem(LEGACY_LS + "_lastSync"));
        state.lastSync = Number.isFinite(storedLastSync) && storedLastSync > 0 ? storedLastSync : null;
        state.syncPending = localStorage.getItem(LEGACY_LS + "_dirty") === "true" ||
          state.notes.some((note) => note.pending);
      } catch (error) {
        console.error("Could not load legacy NoteFlow notes:", error);
        state.notes = seed();
        state.syncPending = false;
        toast("Could not read saved browser notes");
      }
    }

    if (!Array.isArray(state.notes)) {
      state.notes = seed();
      state.syncPending = false;
    }
    state.notes.forEach((note) => {
      if (!Array.isArray(note.attachments)) {
        note.attachments = [];
        migratedNotes = true;
      }
      if (!NOTE_CATEGORIES.includes(note.category)) {
        note.category = defaultCategory(note);
        migratedNotes = true;
      }
      if (typeof note.conflicted !== "boolean") {
        note.conflicted = false;
        migratedNotes = true;
      }
    });
    state.activeId = state.notes.length ? state.notes[0].id : null;
    if (state.storageMode === "indexeddb" && (!notesRecord || migratedNotes)) {
      const saved = await persist();
      if (saved && state.hasLocalSnapshot) {
        localStorage.removeItem(LEGACY_LS);
        localStorage.removeItem(LEGACY_LS + "_dirty");
        localStorage.removeItem(LEGACY_LS + "_lastSync");
        localStorage.removeItem(LEGACY_LS + "_serverLastSync");
      }
    } else if (state.storageMode === "localstorage" && migratedNotes) {
      const saved = await persist();
      if (!saved) return;
    }
  }
  async function persist() {
    const notes = state.notes.map((note) => ({ ...note }));
    const syncPending = state.syncPending;
    const lastSync = state.lastSync;
    try {
      if (state.storageMode === "indexeddb" && state.database) {
        await new Promise((resolve, reject) => {
          const transaction = state.database.transaction(DB_STORE, "readwrite");
          const store = transaction.objectStore(DB_STORE);
          store.put({ key: "notes", value: notes });
          store.put({ key: "syncPending", value: syncPending });
          store.put({ key: "lastSync", value: lastSync });
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Could not save to IndexedDB."));
          transaction.onabort = () => reject(transaction.error || new Error("IndexedDB save was aborted."));
        });
      } else {
        localStorage.setItem(LEGACY_LS, JSON.stringify(notes));
        localStorage.setItem(LEGACY_LS + "_dirty", String(syncPending));
        if (lastSync) localStorage.setItem(LEGACY_LS + "_serverLastSync", String(lastSync));
      }
      return true;
    } catch (error) {
      console.error("Could not save NoteFlow data:", error);
      toast("Could not save notes on this device");
      announce("Could not save notes on this device.");
      logEvent("Local storage failed — changes may not be saved", "warn");
      return false;
    }
  }
  const markDirty = () => { state.syncPending = true; state.revision += 1; };

  async function requestServerNotes(method, notes) {
    const response = await fetch("/api/notes", {
      method,
      headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
      body: method === "PUT" ? JSON.stringify({ notes }) : undefined
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("The NoteFlow server returned an invalid response.");
    }
    if (!response.ok) throw new Error(result.error || "The notes server returned an error.");
    return result;
  }

  function notesDiffer(local, remote) {
    return local.title !== remote.title ||
      local.body !== remote.body ||
      local.pinned !== remote.pinned ||
      local.category !== remote.category ||
      JSON.stringify(local.attachments || []) !== JSON.stringify(remote.attachments || []);
  }

  async function loadFromServer() {
    if (location.protocol === "file:") {
      state.serverConnected = false;
      $("sbSync").textContent = state.storageMode === "indexeddb"
        ? "Saved with IndexedDB · local demo sync"
        : "Saved with localStorage fallback";
      return;
    }
    try {
      const result = await requestServerNotes("GET");
      if (!Array.isArray(result.notes)) throw new Error("The notes server returned invalid note data.");
      state.serverConnected = true;
      const localNotes = state.notes;
      const remoteNotes = result.notes;

      if (!state.hasLocalSnapshot) {
        state.notes = remoteNotes;
      } else if (!remoteNotes.length) {
        localNotes.forEach((note) => { note.pending = true; });
        state.notes = localNotes;
      } else {
        const remoteById = new Map(remoteNotes.map((note) => [note.id, note]));
        const merged = remoteNotes.map((note) => ({ ...note, pending: false }));
        localNotes.forEach((localNote) => {
          const remoteNote = remoteById.get(localNote.id);
          if (!remoteNote) {
            localNote.pending = true;
            merged.push(localNote);
            return;
          }
          const index = merged.findIndex((note) => note.id === localNote.id);
          if (localNote.pending && notesDiffer(localNote, remoteNote)) {
            localNote.conflicted = true;
            merged[index] = localNote;
          } else if (localNote.pending || localNote.ts > remoteNote.ts) {
            localNote.pending = true;
            merged[index] = localNote;
          }
        });
        state.notes = merged;
      }
      state.activeId = state.notes.length ? state.notes[0].id : null;
      state.syncPending = state.syncPending || state.notes.some((note) => note.pending);
      if (state.notes.some((note) => note.pending)) markDirty();
      if (!await persist()) throw new Error("Could not save merged notes to browser storage.");
      renderAll();
      logEvent("Connected to NoteFlow server", "ok");
      if (state.syncPending || state.notes.some((note) => note.conflicted)) void doSync(true);
    } catch (error) {
      state.serverConnected = false;
      console.error("Could not load notes from NoteFlow server:", error);
      $("sbSync").textContent = "Server unavailable — notes saved locally";
      logEvent("Server unavailable — local notes are safe", "warn");
      toast("Server unavailable — notes saved locally");
      renderStatus();
    }
  }

  const active = () => state.notes.find((n) => n.id === state.activeId) || null;
  const pendingCount = () => Math.max(state.notes.filter((n) => n.pending).length, state.syncPending ? 1 : 0);
  function visibleNotes() {
    const query = $("searchInput").value.trim().toLowerCase();
    const category = $("categoryFilter").value;
    return state.notes.filter((note) => {
      const matchesQuery = !query ||
        (note.title + " " + note.body + " " + note.category).toLowerCase().includes(query);
      return matchesQuery && (category === "all" || note.category === category);
    });
  }

  function logEvent(text, kind) {
    state.log.unshift({ text, kind: kind || "info", t: now() });
    if (state.log.length > 30) state.log.pop();
    renderTicker();
  }
  function renderTicker() {
    if (!state.lastSync) {
      $("ticker").innerHTML = '<span class="text-slate-400">Not synced yet</span>';
      return;
    }
    $("ticker").innerHTML = '<span class="truncate text-slate-400">Last synced <b class="font-semibold text-white">' + fmtTime(state.lastSync) + "</b></span>";
  }

  function renderList() {
    const q = $("searchInput").value.trim().toLowerCase();
    let notes = visibleNotes();
    notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);

    const list = $("list");
    list.innerHTML = "";
    $("noteCount").textContent = state.notes.length;
    $("noteCount").setAttribute("aria-label", "Total notes: " + state.notes.length);
    const resultCount = notes.length;
    $("notesAnnouncement").textContent = resultCount + (resultCount === 1 ? " note" : " notes") +
      (q || $("categoryFilter").value !== "all" ? " match the current filters" : " shown");
    $("selectionModeBtn").textContent = state.selectionMode ? "Cancel selection" : "Select";
    $("selectionModeBtn").setAttribute("aria-pressed", state.selectionMode ? "true" : "false");
    $("selectionActions").classList.toggle("hidden", !state.selectionMode);
    $("selectionActions").classList.toggle("flex", state.selectionMode);
    const selectedCount = state.selectedIds.size;
    $("selectionCount").textContent = selectedCount + " selected";
    $("bulkPinBtn").disabled = selectedCount === 0;
    $("bulkDeleteBtn").disabled = selectedCount === 0;
    $("bulkPinBtn").textContent = state.notes.some((note) => state.selectedIds.has(note.id) && !note.pinned)
      ? "Pin selected"
      : "Unpin selected";
    const allVisibleSelected = notes.length > 0 && notes.every((note) => state.selectedIds.has(note.id));
    $("selectAllBtn").textContent = allVisibleSelected ? "Clear selection" : "Select all";

    if (!notes.length) {
      const hasFilter = q || $("categoryFilter").value !== "all";
      list.innerHTML = '<li class="px-3 py-8 text-center text-sm text-slate-500">' +
        (hasFilter ? "No notes match these filters." : "No notes yet. Use “Add note” to create one.") + "</li>";
      return;
    }
    notes.forEach((n) => {
      const isActive = n.id === state.activeId;
      const li = document.createElement("li");
      li.className = "group relative min-w-0 rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.noteId = n.id;
      btn.setAttribute("aria-current", isActive ? "true" : "false");
      btn.className =
        "min-h-[108px] w-full rounded-[10px] border bg-white px-3 py-3 pr-24 text-left transition " +
        (state.selectionMode ? "pl-10 " : "") +
        (isActive ? "border-indigo-200" : "border-transparent");
      const pin = n.pinned ? '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="text-brand"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></svg>' : "";
      const tag = n.pending
        ? '<span class="rounded bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700">Pending</span>'
        : '<span class="rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-700">Synced</span>';
      const category = '<span class="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ' +
        CATEGORY_STYLES[n.category] + '">' + esc(n.category) + "</span>";
      const conflictTag = n.conflicted
        ? '<span class="rounded bg-red-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-red-700">Conflict</span>'
        : "";
      btn.innerHTML =
        '<span class="mb-1 flex items-center gap-1.5">' + pin +
          '<span class="flex-1 truncate text-[13.5px] font-semibold">' + esc(n.title || "Untitled") + "</span></span>" +
        '<span class="block truncate text-xs text-slate-500">' + esc((n.body || "No content").slice(0, 52)) + "</span>" +
        '<span class="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">' + category + conflictTag + tag + "<span>" + relTime(n.ts) + "</span></span>";
      btn.addEventListener("click", () => openNote(n.id, "view"));
      if (state.selectionMode) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.selectedIds.has(n.id);
        checkbox.setAttribute("aria-label", "Select " + (n.title || "Untitled"));
        checkbox.className = "absolute left-3 top-5 z-10 h-5 w-5 cursor-pointer accent-indigo-600";
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) state.selectedIds.add(n.id);
          else state.selectedIds.delete(n.id);
          renderList();
        });
        li.appendChild(checkbox);
      }
      const actions = document.createElement("span");
      actions.className =
        "absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" +
        (state.selectionMode ? " hidden" : "");
      const pinButton = document.createElement("button");
      pinButton.type = "button";
      pinButton.setAttribute("aria-label", (n.pinned ? "Unpin" : "Pin") + " " + (n.title || "Untitled"));
      pinButton.title = n.pinned ? "Unpin note" : "Pin note";
      pinButton.className =
        "grid h-9 w-9 place-items-center rounded-[9px] transition focus-visible:bg-indigo-50 " +
        (n.pinned ? "bg-indigo-50 text-brand" : "text-slate-400 hover:bg-indigo-50 hover:text-brand");
      pinButton.innerHTML = n.pinned
        ? '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.5V21m-4.5-10.5 3.7-3.7a2 2 0 0 1 2.8 2.8L12.5 13c-.3.3-.5.7-.5 1.1V17h-1v-2.9c0-.4-.2-.8-.5-1.1L7 10.5l1-1.5Zm1 .5L7.5 8l.7-.7 1.3 1.3 1.6-1.6 2.6 2.6-1.6 1.6L14 10.5l-1.5 1.5Zm0 0Z"/></svg>'
        : '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.5V21M9.5 9l3.3-3.3a2 2 0 1 1 2.8 2.8L12.3 12.8c-.3.3-.5.8-.5 1.3V17h-1v-2.9c0-.5-.2-1-.5-1.3L8 9.7l1.5-.2ZM8 10.5l-2.5 2.5M16 13.5l2.5 2.5"/></svg>';
      pinButton.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePinned(n.id);
      });
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.setAttribute("aria-label", "Edit " + (n.title || "Untitled"));
      editButton.title = "Edit note";
      editButton.className =
        "grid h-9 w-9 place-items-center rounded-[9px] text-slate-400 transition hover:bg-indigo-50 hover:text-brand focus-visible:bg-indigo-50";
      editButton.innerHTML =
        '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openNote(n.id, "edit");
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", "Delete " + (n.title || "Untitled"));
      deleteButton.title = "Delete note";
      deleteButton.className =
        "grid h-9 w-9 place-items-center rounded-[9px] text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:bg-red-50";
      deleteButton.innerHTML =
        '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        requestDelete(n.id);
      });
      actions.appendChild(pinButton);
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      li.appendChild(btn);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function renderEditor() {
    const draft = state.draft;
    $("editor").classList.toggle("hidden", !draft);
    $("editor").setAttribute("aria-hidden", draft ? "false" : "true");
    document.body.classList.toggle("editor-open", !!draft);
    if (!draft) return;

    const readOnly = state.editorMode === "view";
    $("editorHeading").textContent = state.editingId
      ? readOnly ? "View note" : "Edit note"
      : "New note";
    $("deleteLabel").textContent = state.editingId ? "Delete note" : "Discard draft";
    $("editBtn").classList.toggle("hidden", !readOnly || !state.editingId);
    $("saveBtn").classList.toggle("hidden", readOnly);
    $("deleteBtn").classList.toggle("hidden", readOnly && !!state.editingId);
    $("simulateConflictEditorBtn").classList.toggle("hidden", !state.editingId);
    $("simulateConflictEditorBtn").disabled = !state.editingId ||
      !state.notes.some((note) => note.id === state.editingId);
    $("syncEditorBtn").classList.toggle("hidden",
      pendingCount() === 0 && !state.notes.some((note) => note.conflicted === true));
    $("titleInput").readOnly = readOnly;
    $("bodyInput").readOnly = readOnly;
    $("categoryInput").disabled = readOnly;
    $("formulaKeyboardToggle").classList.toggle("hidden", readOnly);
    $("formulaKeyboardToggle").textContent = state.formulaKeyboardOpen ? "Close keyboard" : "Open keyboard";
    $("formulaKeyboardToggle").setAttribute("aria-expanded", !readOnly && state.formulaKeyboardOpen ? "true" : "false");
    $("formulaKeyboard").classList.toggle("hidden", readOnly || !state.formulaKeyboardOpen);
    $("pinBtn").classList.toggle("hidden", readOnly);
    $("addAttachmentBtn").classList.toggle("hidden", readOnly);
    $("titleInput").value = draft.title;
    $("bodyInput").value = draft.body;
    $("categoryInput").value = draft.category || "Personal";
    $("pinBtn").setAttribute("aria-pressed", draft.pinned ? "true" : "false");
    $("pinBtn").setAttribute("aria-label", draft.pinned ? "Unpin this note" : "Pin this note");
    $("pinBtn").classList.toggle("text-brand", draft.pinned);
    renderAttachments(draft.attachments || [], readOnly);
    renderConflictCard();

    const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
    $("wordCount").textContent = words + (words === 1 ? " word" : " words");
    $("lastSync").textContent = state.lastSync ? "Last synced to server " + fmtTime(state.lastSync) : "";

    const ss = $("saveState");
    if (readOnly) {
      ss.classList.remove("text-amber-700");
      ss.querySelector("span").classList.replace("bg-amber-500", "bg-emerald-500");
      ss.querySelector("span").classList.remove("blink");
      $("saveText").textContent = draft.pending
        ? "Saved on this device — sync pending"
        : state.storageMode === "indexeddb" ? "Saved on this device (IndexedDB)" : "Saved on this device";
      return;
    }
    ss.classList.add("text-amber-700");
    ss.querySelector("span").classList.replace("bg-emerald-500", "bg-amber-500");
    ss.querySelector("span").classList.add("blink");
    $("saveText").textContent = "Unsaved changes — save to keep this note";
  }

  function renderFormulaKeys(containerId, keys) {
    const container = $(containerId);
    keys.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "min-h-10 min-w-10 rounded-lg border border-indigo-100 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-95";
      button.textContent = key.label;
      button.setAttribute("aria-label", "Insert " + key.label);
      button.title = "Insert " + key.value;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => insertText(key.value, key.cursor));
      container.appendChild(button);
    });
  }

  function insertText(value, cursorOffset) {
    const textarea = $("bodyInput");
    if (!state.draft || textarea.readOnly) return;
    const start = Math.min(bodySelection.start, textarea.value.length);
    const end = Math.min(Math.max(bodySelection.end, start), textarea.value.length);
    textarea.setRangeText(value, start, end, "end");
    const caret = start + (cursorOffset === undefined ? value.length : cursorOffset);
    textarea.setSelectionRange(caret, caret);
    bodySelection = { start: caret, end: caret };
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function renderSimpleKeyboard() {
    const container = $("simpleKeys");
    container.replaceChildren();
    const rows = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
    rows.forEach((row) => {
      const rowElement = document.createElement("div");
      rowElement.className = "flex flex-wrap justify-center gap-1.5";
      Array.from(row).forEach((character) => {
        const value = state.simpleShift ? character.toUpperCase() : character;
        const button = createKeyboardButton(value, () => insertText(value));
        button.classList.add("min-w-0", "flex-1", "px-1", "sm:min-w-10", "sm:flex-none");
        rowElement.appendChild(button);
      });
      container.appendChild(rowElement);
    });

    const controls = document.createElement("div");
    controls.className = "flex flex-wrap justify-center gap-1.5";
    const shiftButton = createKeyboardButton("Shift", () => {
      state.simpleShift = !state.simpleShift;
      renderSimpleKeyboard();
      $("simpleKeyboardTab").focus();
    });
    shiftButton.className += state.simpleShift ? " bg-indigo-100 text-indigo-800" : "";
    shiftButton.setAttribute("aria-pressed", state.simpleShift ? "true" : "false");
    controls.appendChild(shiftButton);
    controls.appendChild(createKeyboardButton("⌫", () => deleteBeforeCursor(), "Backspace"));
    controls.appendChild(createKeyboardButton("Space", () => insertText(" "), "Insert space"));
    controls.appendChild(createKeyboardButton("Enter", () => insertText("\n"), "Insert new line"));
    container.appendChild(controls);
  }

  function createKeyboardButton(label, onClick, ariaLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "min-h-10 min-w-10 rounded-lg border border-indigo-100 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-95";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel || "Type " + label);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", onClick);
    return button;
  }

  function deleteBeforeCursor() {
    const textarea = $("bodyInput");
    if (!state.draft || textarea.readOnly) return;
    let start = Math.min(bodySelection.start, textarea.value.length);
    let end = Math.min(Math.max(bodySelection.end, start), textarea.value.length);
    if (start === end && start > 0) start -= 1;
    if (start === end) return;
    textarea.setRangeText("", start, end, "end");
    const caret = start;
    textarea.setSelectionRange(caret, caret);
    bodySelection = { start: caret, end: caret };
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setFormulaKeyboardMode(mode) {
    state.formulaKeyboardMode = mode;
    const tabs = [
      ["math", "mathKeyboardTab", "mathKeyboardPanel"],
      ["chemistry", "chemistryKeyboardTab", "chemistryKeyboardPanel"],
      ["simple", "simpleKeyboardTab", "simpleKeyboardPanel"]
    ];
    tabs.forEach(([tabMode, tabId, panelId]) => {
      const selected = mode === tabMode;
      $(tabId).setAttribute("aria-selected", selected ? "true" : "false");
      $(tabId).tabIndex = selected ? 0 : -1;
      $(tabId).className = selected
        ? "h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white"
        : "h-9 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700";
      $(panelId).classList.toggle("hidden", !selected);
    });
    $("keyboardHint").textContent = mode === "simple"
      ? "Tap a key to type at your cursor. Shift changes letter case."
      : "Choose a " + (mode === "chemistry" ? "chemistry symbol" : "math symbol") + " to insert it at your cursor in the note.";
    if (mode === "simple") renderSimpleKeyboard();
  }

  function renderAttachments(attachments, readOnly) {
    const list = $("attachmentList");
    list.replaceChildren();
    attachments.forEach((attachment, index) => {
      const item = document.createElement("div");
      item.className = "relative flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2";
      item.setAttribute("role", "listitem");
      if (attachment.type && attachment.type.startsWith("image/")) {
        const previewButton = document.createElement("button");
        previewButton.type = "button";
        previewButton.className = "cursor-zoom-in rounded-lg focus-visible:outline-brand";
        previewButton.setAttribute("aria-label", "Preview image " + attachment.name);
        const image = document.createElement("img");
        image.src = attachment.data;
        image.alt = attachment.name;
        image.className = "h-[150px] w-[120px] rounded-lg object-cover";
        previewButton.appendChild(image);
        previewButton.addEventListener("click", () => openImageViewer(attachment, previewButton));
        item.appendChild(previewButton);
      } else {
        const link = document.createElement("a");
        link.href = attachment.data;
        link.download = attachment.name;
        link.className = "max-w-[220px] truncate px-2 py-3 text-sm font-medium text-brand hover:underline";
        link.textContent = attachment.name;
        item.appendChild(link);
      }
      if (!readOnly) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white text-slate-500 shadow-sm hover:text-red-600";
        removeButton.setAttribute("aria-label", "Remove " + attachment.name);
        removeButton.innerHTML = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m18 6-12 12M6 6l12 12"/></svg>';
        removeButton.addEventListener("click", () => {
          if (!state.draft) return;
          state.draft.attachments.splice(index, 1);
          renderAttachments(state.draft.attachments, false);
        });
        item.appendChild(removeButton);
      }
      list.appendChild(item);
    });
  }

  function openImageViewer(attachment, trigger) {
    imageViewerTrigger = trigger;
    $("imageViewerImage").src = attachment.data;
    $("imageViewerImage").alt = attachment.name;
    $("imageViewerName").textContent = attachment.name;
    $("imageViewer").classList.remove("hidden");
    $("imageViewer").classList.add("flex");
    $("imageViewer").setAttribute("aria-hidden", "false");
    setPageInert(true);
    $("editor").inert = !!state.draft;
    if (state.draft) $("editor").setAttribute("aria-hidden", "true");
    $("closeImageViewerBtn").focus();
  }

  function closeImageViewer() {
    if ($("imageViewer").classList.contains("hidden")) return;
    $("imageViewer").classList.add("hidden");
    $("imageViewer").classList.remove("flex");
    $("imageViewer").setAttribute("aria-hidden", "true");
    $("imageViewerImage").removeAttribute("src");
    if (state.draft) {
      $("editor").inert = false;
      $("editor").setAttribute("aria-hidden", "false");
    } else {
      setPageInert(false);
    }
    if (imageViewerTrigger && imageViewerTrigger.isConnected) imageViewerTrigger.focus();
    imageViewerTrigger = null;
  }

  function readAttachment(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        data: reader.result
      });
      reader.onerror = () => reject(reader.error || new Error("Could not read " + file.name));
      reader.readAsDataURL(file);
    });
  }

  function openNote(id, mode) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return;
    state.editorReturnFocus = document.activeElement;
    state.activeId = id;
    state.editingId = id;
    state.editorMode = mode;
    state.draft = { ...note };
    state.formulaKeyboardOpen = false;
    setPageInert(true);
    renderAll();
    if (mode === "edit") $("titleInput").focus();
    else $("editorHeading").focus();
  }

  function closeEditor(message) {
    const noteId = state.editingId;
    state.draft = null;
    state.editingId = null;
    state.editorMode = "view";
    state.formulaKeyboardOpen = false;
    $("editor").inert = false;
    setPageInert(false);
    renderAll();
    if (noteId) focusNoteCard(noteId);
    else if (state.editorReturnFocus && state.editorReturnFocus.isConnected) state.editorReturnFocus.focus();
    else $("addBtn").focus();
    state.editorReturnFocus = null;
    if (message) {
      toast(message);
      announce(message);
    }
  }

  function requestDelete(id) {
    const ids = (Array.isArray(id) ? id : [id]).filter((targetId) => state.notes.some((note) => note.id === targetId));
    if (!ids.length) return;
    state.deleteReturnFocus = document.activeElement;
    state.deleteTargetIds = ids;
    const isMultiple = ids.length > 1;
    $("deleteConfirmTitle").textContent = isMultiple ? "Delete " + ids.length + " notes?" : "Delete this note?";
    $("deleteConfirmDescription").textContent = isMultiple
      ? "These notes will be permanently removed from this device."
      : "This note will be permanently removed from this device.";
    $("confirmDeleteBtn").textContent = isMultiple ? "Delete " + ids.length + " notes" : "Delete";
    $("deleteConfirm").classList.remove("hidden");
    $("deleteConfirm").classList.add("flex");
    $("deleteConfirm").setAttribute("aria-hidden", "false");
    $("editor").setAttribute("aria-hidden", "true");
    $("editor").inert = !!state.draft;
    setPageInert(true);
    $("cancelDeleteBtn").focus();
  }

  function closeDeleteConfirmation() {
    state.deleteTargetIds = null;
    $("deleteConfirm").classList.add("hidden");
    $("deleteConfirm").classList.remove("flex");
    $("deleteConfirm").setAttribute("aria-hidden", "true");
    if (state.draft) {
      $("editor").setAttribute("aria-hidden", "false");
      $("editor").inert = false;
      $("deleteBtn").focus();
    } else {
      setPageInert(false);
      if (state.deleteReturnFocus && state.deleteReturnFocus.isConnected) state.deleteReturnFocus.focus();
      else $("addBtn").focus();
    }
    state.deleteReturnFocus = null;
  }

  function togglePinned(id) {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return;
    note.pinned = !note.pinned;
    note.ts = now();
    note.pending = true;
    if (state.draft && state.draft.id === id) state.draft.pinned = note.pinned;
    markDirty();
    persist();
    renderAll();
    toast(note.pinned ? "Note pinned" : "Note unpinned");
    announce(note.pinned ? "Note pinned." : "Note unpinned.");
    logEvent(note.pinned ? "Note pinned — sync pending" : "Pinned note removed — sync pending", "info");
    queueSync();
  }

  function toggleSelectionMode() {
    state.selectionMode = !state.selectionMode;
    if (!state.selectionMode) state.selectedIds.clear();
    renderList();
  }

  function selectAllVisible() {
    const notes = visibleNotes();
    const allSelected = notes.length > 0 && notes.every((note) => state.selectedIds.has(note.id));
    notes.forEach((note) => {
      if (allSelected) state.selectedIds.delete(note.id);
      else state.selectedIds.add(note.id);
    });
    renderList();
  }

  function setSelectedPinned(pinned) {
    if (!state.selectedIds.size) return;
    const timestamp = now();
    let changed = false;
    state.notes.forEach((note) => {
      if (!state.selectedIds.has(note.id) || note.pinned === pinned) return;
      note.pinned = pinned;
      note.ts = timestamp;
      note.pending = true;
      changed = true;
    });
    if (!changed) return;
    markDirty();
    persist();
    renderAll();
    const message = state.selectedIds.size + (state.selectedIds.size === 1 ? " note" : " notes") +
      (pinned ? " pinned" : " unpinned");
    toast(message);
    announce(message + ".");
    logEvent(message + " — sync pending", "info");
    queueSync();
  }

  function saveNote() {
    if (!state.draft) return;
    const note = { ...state.draft, ts: now(), pending: true };
    const existingIndex = state.notes.findIndex((item) => item.id === state.editingId);
    if (existingIndex === -1) state.notes.unshift(note);
    else state.notes[existingIndex] = note;
    state.activeId = note.id;
    state.draft = null;
    state.editingId = null;
    state.editorMode = "view";
    state.formulaKeyboardOpen = false;
    $("editor").inert = false;
    setPageInert(false);
    markDirty();
    persist();
    renderAll();
    focusNoteCard(note.id);
    state.editorReturnFocus = null;
    toast("Note saved");
    announce("Note saved.");
    logEvent("Note saved — server sync queued", "info");
    queueSync();
  }

  function renderStatus() {
    const online = isOnline();
    const pill = $("connPill");
    pill.classList.toggle("bg-amber-50", !online);
    pill.classList.toggle("text-amber-700", !online);
    pill.classList.toggle("border-amber-200", !online);
    pill.classList.toggle("bg-emerald-50", online);
    pill.classList.toggle("text-emerald-700", online);
    pill.classList.toggle("border-emerald-200", online);
    $("connText").textContent = online ? "Online" : "Offline";
    $("sbConn").textContent = online ? "Online" : "Offline";
    $("sbDot").classList.toggle("bg-amber-500", !online);
    $("sbDot").classList.toggle("bg-emerald-500", online);

    const pc = pendingCount();
    const b = $("pendingBadge");
    b.textContent = pc + " pending";
    b.classList.toggle("bg-amber-50", pc > 0);
    b.classList.toggle("text-amber-700", pc > 0);
    b.classList.toggle("bg-slate-100", pc === 0);
    b.classList.toggle("text-slate-500", pc === 0);
    $("sbQueued").textContent = pc + " queued";
    $("sbSync").textContent = state.lastSync
      ? (location.protocol === "file:" ? "Last local demo sync " : "Last synced to server ") + fmtTime(state.lastSync)
      : state.serverConnected
        ? "Connected to NoteFlow server"
        : location.protocol === "file:"
          ? state.storageMode === "indexeddb" ? "Saved with IndexedDB · local demo sync" : "Saved with localStorage fallback"
          : "Server unavailable — notes saved locally";

    const sb = $("syncBtn");
    const hasConflicts = state.notes.some((note) => note.conflicted === true);
    sb.disabled = !online || (pc === 0 && !hasConflicts) || state.syncInFlight;
    sb.classList.toggle("pulse", online && (pc > 0 || hasConflicts));
    $("syncEditorBtn").disabled = !online || (pc === 0 && !hasConflicts) || state.syncInFlight;
    const conflictTargetId = state.editingId || state.activeId;
    $("simulateConflictBtn").disabled = !state.notes.some((note) => note.id === conflictTargetId);
  }

  const renderAll = () => { renderList(); renderEditor(); renderStatus(); };

  let saveTimer = null;
  function queueSync() {
    clearTimeout(saveTimer);
    if (isOnline() && location.protocol !== "file:") {
      saveTimer = setTimeout(() => { void doSync(true); }, 1300);
    }
  }

  function conflictBlockingSync() {
    const note = state.notes.find((item) => item.conflicted === true);
    if (!note) return false;
    showConflict(note);
    return true;
  }

  async function doLocalSync(auto) {
    const pc = pendingCount();
    const revision = state.revision;
    const btn = $("syncBtn");
    const label = btn.innerHTML;
    state.syncInFlight = true;
    btn.innerHTML = "Syncing…";
    renderStatus();
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (conflictBlockingSync()) return;
      if (revision === state.revision) {
        state.notes.forEach((note) => { note.pending = false; });
        state.syncPending = false;
        state.lastSync = now();
        if (!await persist()) return;
      }
      const message = revision === state.revision
        ? (auto ? "Changes synced locally (demo)" : pc + (pc === 1 ? " change" : " changes") + " synced locally (demo)")
        : "Changes made during sync are still pending";
      renderAll();
      toast(message);
      announce(message);
      logEvent(message, revision === state.revision ? "ok" : "info");
      if (revision !== state.revision) queueSync();
    } finally {
      state.syncInFlight = false;
      btn.innerHTML = label;
      renderStatus();
    }
  }

  async function doSync(auto) {
    if (!isOnline() || state.syncInFlight) return;
    if (conflictBlockingSync()) return;
    if (!state.syncPending) return;
    if (location.protocol === "file:") {
      await doLocalSync(auto);
      return;
    }
    const pc = pendingCount();
    const btn = $("syncBtn");
    const label = btn.innerHTML;
    const revision = state.revision;
    state.syncInFlight = true;
    btn.innerHTML = "Syncing…";
    renderStatus();
    try {
      const serverNotes = state.notes.map((note) => ({ ...note, pending: false }));
      await requestServerNotes("PUT", serverNotes);
      state.serverConnected = true;
      if (conflictBlockingSync()) return;
      if (revision === state.revision) {
        state.notes.forEach((n) => (n.pending = false));
        state.syncPending = false;
      }
      state.lastSync = now();
      if (!await persist()) return;
      const msg = revision === state.revision
        ? (auto ? "Changes synced to server" : pc + (pc === 1 ? " change" : " changes") + " synced to server")
        : "Latest changes queued for server sync";
      renderAll();
      toast(msg); announce(msg);
      logEvent(msg, revision === state.revision ? "ok" : "info");
      if (revision !== state.revision) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { void doSync(true); }, 0);
      }
    } catch (error) {
      state.serverConnected = false;
      console.error("Could not sync notes to NoteFlow server:", error);
      const message = "Server sync failed — changes are still saved on this device";
      toast(message);
      announce(message);
      logEvent(message, "warn");
    } finally {
      state.syncInFlight = false;
      btn.innerHTML = label;
      renderStatus();
    }
  }

  function showConflict(note) {
    if (!note) return;
    state.conflictNoteId = note.id;
    if (!state.draft) {
      openNote(note.id, "view");
    } else {
      renderEditor();
    }
    logEvent("Conflict detected — awaiting choice", "warn");
    announce("Conflict detected for " + (note.title || "Untitled") + ". Choose which version to keep.");
  }

  function renderConflictCard() {
    const area = $("conflictArea");
    const note = state.notes.find((item) => item.id === state.conflictNoteId);
    area.replaceChildren();
    if (!note || !note.conflicted) return;
    area.innerHTML =
      '<div role="alert" class="slidein mt-4 rounded-xl border border-red-200 bg-red-50 p-4">' +
        '<p class="flex items-center gap-2 text-sm font-bold text-red-800">⚠ Conflict detected</p>' +
        '<p class="mt-1 text-[13px] leading-relaxed text-red-900">This note was also edited on another device. Both versions can\'t win — choose one. Nothing is overwritten silently.</p>' +
        (note.id !== state.draft.id ? '<p class="mt-2 text-xs font-semibold text-red-800">Conflicting note: ' + esc(note.title || "Untitled") + "</p>" : "") +
        '<div class="mt-3 flex flex-wrap gap-2">' +
          '<button id="keepMine" type="button" class="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50">Keep my version</button>' +
          '<button id="keepTheirs" type="button" class="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50">Keep the other version</button>' +
          '<button id="dismissC" type="button" class="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Dismiss</button>' +
        "</div></div>";
    $("keepMine").onclick = () => resolveConflict("mine");
    $("keepTheirs").onclick = () => resolveConflict("other");
    $("dismissC").onclick = () => {
      state.conflictNoteId = null;
      area.replaceChildren();
      logEvent("Conflict dismissed — still unresolved", "warn");
      $("editorHeading").focus();
    };
  }

  function resolveConflict(choice) {
    const note = state.notes.find((item) => item.id === state.conflictNoteId);
    if (!note || !note.conflicted) return;
    const isCurrentDraft = state.draft && state.draft.id === note.id && state.editorMode === "edit";

    // Keep any in-progress local edits when choosing this device's version.
    if (choice === "mine" && isCurrentDraft) {
      Object.assign(note, state.draft, { ts: now() });
    }
    note.conflicted = false;
    note.pending = choice === "mine";
    if (state.draft && state.draft.id === note.id) {
      state.draft.conflicted = false;
      state.draft.pending = note.pending;
      if (choice === "mine" && isCurrentDraft) Object.assign(state.draft, note);
    }
    if (choice === "mine") markDirty();
    state.conflictNoteId = null;
    persist();
    renderAll();
    const message = choice === "mine"
      ? "Conflict resolved — kept your version"
      : "Conflict resolved — kept other version";
    toast(choice === "mine" ? "Kept your version" : "Kept the other version");
    announce(message + ".");
    logEvent(message, "ok");
    $("editorHeading").focus();
    if (choice === "mine") queueSync();
  }

  let toastT;
  function toast(msg) {
    $("toastMsg").textContent = msg;
    const t = $("toast");
    t.classList.add("translate-y-0"); t.classList.remove("translate-y-[150%]");
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.remove("translate-y-0"); t.classList.add("translate-y-[150%]"); }, 1900);
  }

  /* ---------------- Events ---------------- */
  const addNote = () => {
    state.editorReturnFocus = document.activeElement;
    state.editingId = null;
    state.editorMode = "edit";
    state.draft = { id: "n" + now(), title: "", body: "", ts: now(), pinned: false, pending: true, category: "Personal", attachments: [], conflicted: false };
    setPageInert(true);
    renderAll();
    $("titleInput").focus();
    announce("New note editor opened.");
  };
  $("addBtn").onclick = addNote;
  $("saveBtn").onclick = saveNote;
  $("editBtn").onclick = () => {
    if (!state.draft || !state.editingId) return;
    state.editorMode = "edit";
    renderEditor();
    $("titleInput").focus();
  };
  $("cancelBtn").onclick = () => closeEditor("Changes discarded");
  $("deleteBtn").onclick = () => {
    if (state.editingId) requestDelete(state.editingId);
    else closeEditor("Draft discarded");
  };
  $("cancelDeleteBtn").onclick = closeDeleteConfirmation;
  $("confirmDeleteBtn").onclick = () => {
    const ids = state.deleteTargetIds;
    closeDeleteConfirmation();
    if (ids) deleteNotes(ids);
  };
  $("selectionModeBtn").onclick = toggleSelectionMode;
  $("selectAllBtn").onclick = selectAllVisible;
  $("bulkPinBtn").onclick = () => {
    const shouldPin = state.notes.some((note) => state.selectedIds.has(note.id) && !note.pinned);
    setSelectedPinned(shouldPin);
  };
  $("bulkDeleteBtn").onclick = () => {
    if (state.selectedIds.size) requestDelete(Array.from(state.selectedIds));
  };
  function simulateCurrentConflict() {
    const note = state.notes.find((item) => item.id === state.editingId);
    if (!note) {
      toast("Open a note first");
      return;
    }
    note.conflicted = true;
    if (state.draft && state.draft.id === note.id) {
      state.draft.conflicted = true;
    }
    clearTimeout(saveTimer);
    state.revision += 1;
    persist();
    renderAll();
    logEvent("Conflict simulated on current note", "warn");
    toast("Conflict simulated — now press Sync");
    announce("Conflict simulated on current note. Press Sync now to review it.");
  }
  $("simulateConflictBtn").onclick = simulateCurrentConflict;
  $("simulateConflictEditorBtn").onclick = simulateCurrentConflict;
  $("syncEditorBtn").onclick = () => { void doSync(false); };

  function deleteNote(id) {
    deleteNotes([id]);
  }

  function deleteNotes(ids) {
    const targetIds = new Set(ids);
    const deletedNotes = state.notes.filter((note) => targetIds.has(note.id));
    if (!deletedNotes.length) return;
    state.notes = state.notes.filter((note) => !targetIds.has(note.id));
    deletedNotes.forEach((note) => state.selectedIds.delete(note.id));
    if (targetIds.has(state.activeId)) state.activeId = state.notes.length ? state.notes[0].id : null;
    if (state.editingId && targetIds.has(state.editingId)) {
      state.draft = null;
      state.editingId = null;
      state.formulaKeyboardOpen = false;
    }
    markDirty();
    persist();
    renderAll();
    const message = deletedNotes.length === 1 ? "Note deleted" : deletedNotes.length + " notes deleted";
    toast(message);
    announce(message + ".");
    logEvent(message + " (offline-safe)", "info");
    queueSync();
  }
  $("pinBtn").onclick = () => {
    if (!state.draft) return;
    state.draft.pinned = !state.draft.pinned;
    renderEditor();
  };
  $("addAttachmentBtn").onclick = () => $("attachmentInput").click();
  $("attachmentInput").onchange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!state.draft || !files.length) return;
    const attachedBytes = (state.draft.attachments || []).reduce((total, attachment) => total + (attachment.size || 0), 0);
    const selectedBytes = files.reduce((total, file) => total + file.size, 0);
    if (attachedBytes + selectedBytes > MAX_ATTACHMENT_BYTES) {
      toast("Attachments must total 1 MB or less per note");
      announce("Attachments must total 1 megabyte or less per note.");
      return;
    }
    try {
      const attachments = await Promise.all(files.map(readAttachment));
      if (!state.draft) return;
      state.draft.attachments = (state.draft.attachments || []).concat(attachments);
      renderAttachments(state.draft.attachments, false);
      announce(files.length === 1 ? "Attachment added." : files.length + " attachments added.");
    } catch (error) {
      console.error("Could not read note attachment:", error);
      toast("Could not read the selected file");
    }
  };
  $("titleInput").oninput = (e) => { if (state.draft) state.draft.title = e.target.value; };
  $("categoryInput").onchange = (e) => { if (state.draft) state.draft.category = e.target.value; };
  $("bodyInput").oninput = (e) => {
    if (!state.draft) return;
    state.draft.body = e.target.value;
    bodySelection = { start: e.target.selectionStart, end: e.target.selectionEnd };
    const words = state.draft.body.trim() ? state.draft.body.trim().split(/\s+/).length : 0;
    $("wordCount").textContent = words + (words === 1 ? " word" : " words");
  };
  $("bodyInput").addEventListener("select", () => {
    bodySelection = { start: $("bodyInput").selectionStart, end: $("bodyInput").selectionEnd };
  });
  $("bodyInput").addEventListener("keyup", () => {
    bodySelection = { start: $("bodyInput").selectionStart, end: $("bodyInput").selectionEnd };
  });
  $("bodyInput").addEventListener("pointerup", () => {
    bodySelection = { start: $("bodyInput").selectionStart, end: $("bodyInput").selectionEnd };
  });
  $("formulaKeyboardToggle").onclick = () => {
    state.formulaKeyboardOpen = !state.formulaKeyboardOpen;
    if (state.formulaKeyboardOpen) {
      state.formulaKeyboardMode = "math";
      setFormulaKeyboardMode("math");
    }
    $("formulaKeyboardToggle").textContent = state.formulaKeyboardOpen ? "Close keyboard" : "Open keyboard";
    $("formulaKeyboardToggle").setAttribute("aria-expanded", state.formulaKeyboardOpen ? "true" : "false");
    $("formulaKeyboard").classList.toggle("hidden", !state.formulaKeyboardOpen);
  };
  $("mathKeyboardTab").onclick = () => setFormulaKeyboardMode("math");
  $("chemistryKeyboardTab").onclick = () => setFormulaKeyboardMode("chemistry");
  $("simpleKeyboardTab").onclick = () => setFormulaKeyboardMode("simple");
  $("searchInput").oninput = renderList;
  $("categoryFilter").onchange = renderList;
  $("searchToggle").onclick = () => {
    const header = document.querySelector(".app-header");
    const isOpen = header.classList.toggle("search-open");
    $("searchToggle").setAttribute("aria-expanded", isOpen ? "true" : "false");
    $("searchToggle").setAttribute("aria-label", isOpen ? "Close search" : "Open search");
    if (isOpen) $("searchInput").focus();
  };
  $("searchForm").addEventListener("submit", (event) => event.preventDefault());
  $("syncBtn").onclick = () => { void doSync(false); };
  applyTheme(loadTheme());
  $("themeToggle").onclick = () => {
    const isDark = document.body.dataset.theme !== "dark";
    applyTheme(isDark);
    try {
      localStorage.setItem(THEME_LS, isDark ? "dark" : "light");
    } catch (error) {
      console.error("Could not save the theme preference:", error);
      toast("Theme changed, but could not be saved");
    }
    announce((isDark ? "Dark" : "Light") + " theme enabled.");
  };
  $("closeImageViewerBtn").onclick = closeImageViewer;
  $("imageViewer").addEventListener("click", (event) => {
    if (event.target === $("imageViewer")) closeImageViewer();
  });
  document.addEventListener("keydown", (event) => {
    trapModalFocus(event);
    if (event.key === "Escape" && !$("imageViewer").classList.contains("hidden")) {
      closeImageViewer();
      return;
    }
    if (event.key === "Escape" && document.querySelector(".app-header").classList.contains("search-open")) {
      document.querySelector(".app-header").classList.remove("search-open");
      $("searchToggle").setAttribute("aria-expanded", "false");
      $("searchToggle").setAttribute("aria-label", "Open search");
      $("searchToggle").focus();
      return;
    }
    if (event.key === "Escape") {
      if (state.deleteTargetIds) closeDeleteConfirmation();
      else if (state.draft) closeEditor("Changes discarded");
      return;
    }
    const tabs = ["mathKeyboardTab", "chemistryKeyboardTab", "simpleKeyboardTab"].map($);
    const activeTabIndex = tabs.indexOf(document.activeElement);
    if (activeTabIndex >= 0 && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : (activeTabIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    }
  });

  window.addEventListener("online", () => { renderStatus(); logEvent("Browser reports: online", "ok"); void doSync(true); });
  window.addEventListener("offline", () => { renderStatus(); logEvent("Browser reports: offline", "warn"); });

  /* ---------------- Boot ---------------- */
  async function startApp() {
    renderFormulaKeys("mathKeys", FORMULA_KEYS.math);
    renderFormulaKeys("chemistryKeys", FORMULA_KEYS.chemistry);
    setFormulaKeyboardMode("math");
    try {
      await load();
      renderAll();
      renderTicker();
      await loadFromServer();
    } catch (error) {
      console.error("Could not initialize NoteFlow storage:", error);
      toast("Could not load saved notes");
    }
  }
  void startApp();
})();