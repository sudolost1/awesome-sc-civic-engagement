const DATA_FILES = {
  groups: "groups.csv",
  groupFallbacks: ["groups.csv", "charleston/groups.csv", "../charleston/groups.csv"],
};

const groupList = document.getElementById("group-list");
const loading = document.getElementById("loading");

const key = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const preferredKeys = (obj, keys) => {
  for (const raw of keys) {
    const target = key(raw);
    const match = Object.keys(obj).find((k) => key(k) === target);
    if (match && obj[match] !== undefined && obj[match] !== "") {
      return obj[match];
    }
  }
  return "";
};

const parseCSV = (text) => {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;
  const pushValue = () => {
    current.push(value);
    value = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && next === "\"") {
      value += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "," || char === "\n")) {
      pushValue();
      if (char === "\n") {
        rows.push(current);
        current = [];
      }
      continue;
    }
    value += char;
  }
  if (value.length || current.length) {
    pushValue();
    rows.push(current);
  }

  const headerRow = rows.shift() || [];
  const headers = headerRow.map((h) => h.trim());
  return rows
    .filter((row) => row.some((cell) => cell && cell.trim()))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ? row[index].trim() : "";
      });
      return record;
    });
};

const fetchCSV = async (paths) => {
  const pathList = Array.isArray(paths) ? paths : [paths];
  for (const path of pathList) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Missing ${path}`);
      }
      const text = await response.text();
      const rows = parseCSV(text.replace(/^\uFEFF/, ""));
      if (rows.length) return rows;
    } catch (error) {
      console.warn(error);
    }
  }
  return [];
};

const renderGroups = (groups) => {
  if (loading) loading.remove();
  if (!groupList) return;
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No groups found. Add data to groups.csv.";
    groupList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  groups.forEach((group) => {
    const card = document.createElement("div");
    card.className = "card group-card";
    const name =
      preferredKeys(group, ["name", "group", "title"]) || "Group";
    const summary = preferredKeys(group, [
      "summary_text",
      "summary",
      "description",
      "about",
      "mission",
    ]);

    card.innerHTML = `<h3>${name}</h3>`;
    const para = document.createElement("p");
    para.className = summary ? "" : "empty-state";
    para.textContent = summary || "No summary available.";
    card.appendChild(para);
    fragment.appendChild(card);
  });

  groupList.appendChild(fragment);
};

const init = async () => {
  const groups = await fetchCSV(DATA_FILES.groupFallbacks);
  const sorted = groups.sort((a, b) => {
    const nameA =
      preferredKeys(a, ["name", "group", "title"]).toLowerCase() || "";
    const nameB =
      preferredKeys(b, ["name", "group", "title"]).toLowerCase() || "";
    return nameA.localeCompare(nameB);
  });
  renderGroups(sorted);
};

init();
