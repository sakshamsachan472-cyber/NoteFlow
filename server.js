"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "data", "notes.json");
const MAX_BODY_SIZE = 10 * 1024 * 1024;
  
// The app is split into three files; the server serves all of them.
const STATIC_FILES = {
  "/": { file: "noteflow.html", type: "text/html; charset=utf-8" },
  "/noteflow.html": { file: "noteflow.html", type: "text/html; charset=utf-8" },
  "/noteflow.js": { file: "noteflow.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

async function readNotes() {
  try {
    const contents = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(contents);
    if (!Array.isArray(data.notes)) throw new Error("Stored notes have an invalid format.");
    return { notes: data.notes, initialized: true };
  } catch (error) {
    if (error.code === "ENOENT") return { notes: [], initialized: false };
    throw error;
  }
}

function isValidNotes(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((note) => {
    if (
      !note ||
      typeof note.id !== "string" ||
      note.id.length === 0 ||
      ids.has(note.id) ||
      typeof note.title !== "string" ||
      typeof note.body !== "string" ||
      !Number.isFinite(note.ts) ||
      typeof note.pinned !== "boolean" ||
      typeof note.pending !== "boolean"
    ) return false;
    ids.add(note.id);
    return true;
  });
}

async function saveNotes(notes) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporaryFile = DATA_FILE + "." + randomUUID() + ".tmp";
  await fs.writeFile(temporaryFile, JSON.stringify({ notes }, null, 2), "utf8");
  await fs.rename(temporaryFile, DATA_FILE);
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://" + HOST + ":" + PORT);

    // ---- API ----
    if (url.pathname === "/api/notes") {
      if (request.method === "GET") {
        sendJson(response, 200, await readNotes());
        return;
      }
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        if (!body || !isValidNotes(body.notes)) {
          sendJson(response, 400, { error: "Notes must be an array of valid note objects." });
          return;
        }
        await saveNotes(body.notes);
        sendJson(response, 200, { saved: true });
        return;
      }
      response.setHeader("Allow", "GET, PUT");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    // ---- Static files (GET / HEAD only) ----
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const entry = STATIC_FILES[url.pathname];
    if (entry) {
      const contents = await fs.readFile(path.join(__dirname, entry.file));
      response.writeHead(200, { "Content-Type": entry.type });
      response.end(request.method === "HEAD" ? undefined : contents);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : "The local notes server could not complete the request."
    });
    if (!error.statusCode) console.error("Request failed:", error);
  }
});

server.listen(PORT, HOST, () => {
  console.log("NoteFlow server running at http://" + HOST + ":" + PORT);
});
