const DATA_FILES = {
  events: "events.csv",
  groups: "groups.csv",
  eventActions: "event_actions.csv",
  actionTypes: "action_types.csv",
  media: "media.csv",
};

const timeline = document.getElementById("timeline");
const loading = document.getElementById("loading");

const key = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeTitle = (value) => key(value).replace(/_/g, " ").trim();

const titleSimilarity = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection += 1;
  });
  const union = tokensA.size + tokensB.size - intersection;
  return union ? intersection / union : 0;
};

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

const fetchCSV = async (path) => {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Missing ${path}`);
    }
    const text = await response.text();
    return parseCSV(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    console.warn(error);
    return [];
  }
};

const parseTime = (time) => {
  if (!time) return "";
  const cleaned = time.trim();
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return cleaned;
  let hour = parseInt(match[1], 10);
  const minutes = match[2] || "00";
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${minutes}`;
};

const parseDate = (date) => {
  if (!date) return "";
  const cleaned = date.trim();
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  const slash = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  return cleaned;
};

const parseDateTime = (event) => {
  const datetime = preferredKeys(event, [
    "start_datetime",
    "datetime",
    "start_date_time",
    "date_time",
  ]);
  if (datetime) {
    const parsed = new Date(datetime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const date = parseDate(
    preferredKeys(event, ["date", "event_date", "start_date"])
  );
  const time = parseTime(
    preferredKeys(event, ["time", "event_time", "start_time"])
  );

  if (!date) return new Date(NaN);
  const iso = time ? `${date}T${time}` : `${date}T12:00`;
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(date);
};

const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
};

const mapBy = (rows, keys) => {
  const map = new Map();
  rows.forEach((row) => {
    const id = preferredKeys(row, keys);
    if (id) map.set(id, row);
  });
  return map;
};

const groupBy = (rows, keys) => {
  const map = new Map();
  rows.forEach((row) => {
    const id = preferredKeys(row, keys);
    if (id) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
  });
  return map;
};

const getAddress = (event) => {
  const address = preferredKeys(event, ["address"]);
  if (address && address !== "Virtual/Remote" && address !== "TBD - Check agenda") {
    return address;
  }
  return "";
};

const getLocation = (event) => {
  const direct = preferredKeys(event, ["location", "venue"]);
  if (direct) return direct;
  const address = getAddress(event);
  if (address) return address;
  const city = preferredKeys(event, ["city"]);
  const state = preferredKeys(event, ["state"]);
  const place = [city, state].filter(Boolean).join(", ");
  return place || "Location TBD";
};

const getEventTitle = (event) =>
  preferredKeys(event, ["event_type", "title", "name", "event_name"]) || "Event";

const getGroupSummary = (group) => {
  if (!group) return "No group summary available.";
  return (
    preferredKeys(group, ["summary_text", "summary", "description", "about", "mission"]) ||
    "No group summary available."
  );
};

const getActionsForEvent = (
  eventId,
  eventTitle,
  eventActions,
  eventActionsMap,
  actionTypesMap
) => {
  const matches = [];
  const seen = new Set();
  const addAction = (action) => {
    const unique =
      preferredKeys(action, ["event_action_id", "id"]) ||
      `${action.action_type_id || ""}::${action.action_description || ""}`;
    if (seen.has(unique)) return;
    seen.add(unique);
    const actionType = actionTypesMap.get(action.action_type_id) || {};
    matches.push({
      ...action,
      actionTypeName: actionType.action_type || "",
      actionTypeDescription: actionType.description || "",
    });
  };

  if (eventId) {
    (eventActionsMap.get(eventId) || []).forEach(addAction);
  }

  const eventTitleKey = normalizeTitle(eventTitle);
  if (eventTitleKey) {
    eventActions.forEach((action) => {
      if (!action._titleKey) return;
      const score = titleSimilarity(eventTitleKey, action._titleKey);
      if (score >= 0.6) addAction(action);
    });
  }

  return matches;
};

const getMediaForEvent = (event, media) => {
  const eventId = preferredKeys(event, ["event_id", "id", "eventid"]);
  const groupId = preferredKeys(event, ["group_id", "groupid"]);

  return media.filter((item) => {
    const mediaEventId = preferredKeys(item, ["event_id", "eventid"]);
    const mediaGroupId = preferredKeys(item, ["group_id", "groupid"]);
    if (mediaEventId && eventId && mediaEventId === eventId) return true;
    if (mediaGroupId && groupId && mediaGroupId === groupId) return true;
    return false;
  });
};

const buildEmbed = (url) => {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    const idMatch = url.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
    if (!idMatch) return null;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${idMatch[1]}`;
    iframe.className = "media-embed";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    return iframe;
  }
  if (lower.includes("vimeo.com")) {
    const idMatch = url.match(/vimeo\.com\/(\d+)/);
    if (!idMatch) return null;
    const iframe = document.createElement("iframe");
    iframe.src = `https://player.vimeo.com/video/${idMatch[1]}`;
    iframe.className = "media-embed";
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    return iframe;
  }
  if (lower.match(/\.(mp4|webm|ogg)$/)) {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.className = "media-embed";
    return video;
  }
  return null;
};

const fetchTextIfExists = async (path) => {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return "";
    return await response.text();
  } catch (error) {
    return "";
  }
};

const buildRecapPaths = (event) => {
  const eventId = preferredKeys(event, ["event_id", "id", "eventid"]);
  const groupId = preferredKeys(event, ["group_id", "groupid"]);
  const dateKey = toDateKey(parseDateTime(event));
  if (!eventId || !groupId || !dateKey) return null;
  const base = `${groupId}-${eventId}-${dateKey}`;
  return {
    human: `recaps/${base}-human_summary.txt`,
    ai: `recaps/${base}-ai_summary.txt`,
  };
};

const buildGoogleMapsUrl = (address) => {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
};

const buildMapsEmbed = (address) => {
  const iframe = document.createElement("iframe");
  iframe.className = "maps-embed";
  iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.allowFullscreen = true;
  return iframe;
};

const buildEventSection = (
  event,
  group,
  eventActionsMap,
  actionTypesMap,
  media,
  options = {}
) => {
  const date = parseDateTime(event);
  const eventTitle = getEventTitle(event);
  const eventId = preferredKeys(event, ["event_id", "id", "eventid"]);
  const location = getLocation(event);
  const address = getAddress(event);
  const eventSourceUrl = preferredKeys(event, [
    "source_url",
    "event_source_url",
    "source_link",
    "source",
  ]);
  const safeDate = Number.isNaN(date.getTime())
    ? new Date(8640000000000000)
    : date;

  const section = document.createElement("section");
  section.className = "event-section";
  section.dataset.datetime = safeDate.toISOString();

  // LEFT SIDE - Group info + Event tagline + Map
  const left = document.createElement("div");
  left.className = "event-left";

  const groupCard = document.createElement("div");
  groupCard.className = "card";
  const groupName = preferredKeys(group || {}, ["name", "group", "title"]) || "Group";

  // Event tagline (name, date, time)
  const tagline = document.createElement("div");
  tagline.className = "event-tagline";
  tagline.innerHTML = `
    <div class="event-title">${eventTitle}</div>
    <div class="event-datetime">${formatDate(date)} at ${formatTime(date)}</div>
    <div class="event-location">${location}</div>
  `;

  groupCard.innerHTML = `<h3>${groupName}</h3>`;
  groupCard.appendChild(tagline);

  const summaryP = document.createElement("p");
  summaryP.className = "group-summary";
  summaryP.textContent = getGroupSummary(group);
  groupCard.appendChild(summaryP);

  const addSourceLink = (container) => {
    if (!eventSourceUrl) return;
    const sourceBtn = document.createElement("a");
    sourceBtn.href = eventSourceUrl;
    sourceBtn.target = "_blank";
    sourceBtn.rel = "noopener";
    sourceBtn.className = "directions-btn source-btn";
    sourceBtn.textContent = "Event Source";
    container.appendChild(sourceBtn);
  };

  // Maps widget
  if (address) {
    const mapsWidget = document.createElement("div");
    mapsWidget.className = "maps-widget";
    mapsWidget.appendChild(buildMapsEmbed(address));

    const directionsBtn = document.createElement("a");
    directionsBtn.href = buildGoogleMapsUrl(address);
    directionsBtn.target = "_blank";
    directionsBtn.rel = "noopener";
    directionsBtn.className = "directions-btn";
    directionsBtn.textContent = "Get Directions";
    mapsWidget.appendChild(directionsBtn);
    addSourceLink(mapsWidget);

    groupCard.appendChild(mapsWidget);
  } else if (eventSourceUrl) {
    const sourceWrap = document.createElement("div");
    sourceWrap.className = "maps-widget";
    addSourceLink(sourceWrap);
    groupCard.appendChild(sourceWrap);
  }

  left.appendChild(groupCard);

  // CENTER - Timeline dot
  const center = document.createElement("div");
  center.className = "event-center";

  const dot = document.createElement("div");
  dot.className = "event-dot";

  center.appendChild(dot);

  // RIGHT SIDE - Actions for this event
  const right = document.createElement("div");
  right.className = "event-right";

  const showSummaries = options.mode === "past";
  const showActions = !showSummaries;

  if (showActions) {
    const actionsCard = document.createElement("div");
    actionsCard.className = "card";
    actionsCard.innerHTML = `<h3>What You Can Do</h3>`;

    const actionList = document.createElement("div");
    actionList.className = "actions-list";

    const actionsForEvent = getActionsForEvent(
      eventId,
      eventTitle,
      eventActionsMap._all || [],
      eventActionsMap,
      actionTypesMap
    );

    if (actionsForEvent.length) {
      // Group actions by action_type_id to collect multiple sources
      const actionsByType = new Map();
      actionsForEvent.forEach((action) => {
        const typeId = action.action_type_id;
        if (!actionsByType.has(typeId)) {
          actionsByType.set(typeId, {
            description: action.action_description || action.actionTypeDescription,
            sources: [],
          });
        }
        if (action.source_url) {
          actionsByType.get(typeId).sources.push({
            url: action.source_url,
            citation: action.source_citation || "Source",
          });
        }
      });

      actionsByType.forEach((actionData) => {
        const item = document.createElement("div");
        item.className = "action-item";

        const descSpan = document.createElement("span");
        descSpan.className = "action-description";
        descSpan.textContent = actionData.description;
        item.appendChild(descSpan);

        if (actionData.sources.length) {
          const sourcesSpan = document.createElement("span");
          sourcesSpan.className = "action-sources";
          actionData.sources.forEach((source, idx) => {
            const link = document.createElement("a");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener";
            link.className = "source-link";
            link.textContent = `[${idx + 1}]`;
            link.title = source.citation;
            sourcesSpan.appendChild(link);
          });
          item.appendChild(sourcesSpan);
        }

        actionList.appendChild(item);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No public actions listed for this event.";
      actionList.appendChild(empty);
    }

    actionsCard.appendChild(actionList);
    right.appendChild(actionsCard);
  }

  if (showSummaries) {
    const summaryCard = document.createElement("div");
    summaryCard.className = "card summary-card";
    summaryCard.innerHTML = "<h3>Event Summary</h3>";

    const humanSummary = document.createElement("div");
    humanSummary.className = "summary-block";
    humanSummary.innerHTML = "<h4>Human summary</h4><p class=\"empty-state\">Loading...</p>";

    const aiSummary = document.createElement("div");
    aiSummary.className = "summary-block";
    aiSummary.innerHTML = "<h4>AI summary</h4><p class=\"empty-state\">Loading...</p>";

    summaryCard.appendChild(humanSummary);
    summaryCard.appendChild(aiSummary);
    right.appendChild(summaryCard);

    const loadSummaries = async () => {
      const recapPaths = buildRecapPaths(event);
      if (recapPaths) {
        const [humanText, aiText] = await Promise.all([
          fetchTextIfExists(recapPaths.human),
          fetchTextIfExists(recapPaths.ai),
        ]);

        const humanPara = humanSummary.querySelector("p");
        humanPara.textContent = humanText || "No human summary available.";

        const aiPara = aiSummary.querySelector("p");
        aiPara.textContent = aiText || "No AI summary available.";
      } else {
        humanSummary.querySelector("p").textContent = "No human summary available.";
        aiSummary.querySelector("p").textContent = "No AI summary available.";
      }
    };

    section.addEventListener("section-visible", loadSummaries);
  }

  section.appendChild(left);
  section.appendChild(center);
  section.appendChild(right);

  return section;
};

const observeSections = (sections) => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-active");
          entry.target.dispatchEvent(new Event("section-visible"));
        } else {
          entry.target.classList.remove("is-active");
        }
      });
    },
    { threshold: 0.6, root: timeline }
  );
  sections.forEach((section) => observer.observe(section));
};

const init = async () => {
  const [events, groups, eventActions, actionTypes, media] = await Promise.all([
    fetchCSV(DATA_FILES.events),
    fetchCSV(DATA_FILES.groups),
    fetchCSV(DATA_FILES.eventActions),
    fetchCSV(DATA_FILES.actionTypes),
    fetchCSV(DATA_FILES.media),
  ]);

  if (!events.length) {
    loading.textContent = "No events found. Add data to events.csv.";
    return;
  }

  const groupsById = mapBy(groups, ["group_id", "id", "groupid"]);
  const eventActionsMap = groupBy(eventActions, ["event_id", "eventid"]);
  eventActions.forEach((action) => {
    action._titleKey = normalizeTitle(
      preferredKeys(action, ["event_title", "event_name", "title", "event"])
    );
  });
  eventActionsMap._all = eventActions;
  const actionTypesMap = mapBy(actionTypes, ["action_type_id"]);

  const timelineMode = document.body.dataset.timeline || "upcoming";
  const now = new Date();

  const filteredEvents = events.filter((event) => {
    const date = parseDateTime(event);
    if (Number.isNaN(date.getTime())) return false;
    if (timelineMode === "past") return date.getTime() < now.getTime();
    if (timelineMode === "upcoming") return date.getTime() >= now.getTime();
    return true;
  });

  if (!filteredEvents.length) {
    loading.textContent =
      timelineMode === "past"
        ? "No past events found yet."
        : "No upcoming events found yet.";
    return;
  }

  const sortedEvents = filteredEvents
    .map((event) => ({
      ...event,
      _date: parseDateTime(event),
    }))
    .sort((a, b) => {
      const timeA = Number.isNaN(a._date.getTime())
        ? Number.MAX_SAFE_INTEGER
        : a._date.getTime();
      const timeB = Number.isNaN(b._date.getTime())
        ? Number.MAX_SAFE_INTEGER
        : b._date.getTime();
      if (timelineMode === "past") return timeB - timeA;
      return timeA - timeB;
    });

  loading.remove();

  const sections = sortedEvents.map((event) => {
    const groupId = preferredKeys(event, ["group_id", "groupid"]);
    const group = groupId ? groupsById.get(groupId) : null;
    return buildEventSection(event, group, eventActionsMap, actionTypesMap, media, {
      mode: timelineMode,
    });
  });

  sections.forEach((section) => timeline.appendChild(section));
  observeSections(sections);
  timeline.scrollTop = 0;
};

init();
