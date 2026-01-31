const DATA_FILES = {
  events: "events.csv",
  groups: "groups.csv",
  actions: "actions.csv",
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

const isPastEvent = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
};

const getLocation = (event) => {
  const direct = preferredKeys(event, ["location", "venue", "address"]);
  if (direct) return direct;
  const city = preferredKeys(event, ["city"]);
  const state = preferredKeys(event, ["state"]);
  const place = [city, state].filter(Boolean).join(", ");
  return place || "Location TBD";
};

const getEventTitle = (event) =>
  preferredKeys(event, ["title", "name", "event_name"]) || "Event";

const getGroupSummary = (group) => {
  if (!group) return "No group summary available.";
  return (
    preferredKeys(group, ["summary", "description", "about", "mission"]) ||
    "No group summary available."
  );
};

const getActionLabel = (action) =>
  preferredKeys(action, ["action", "title", "name", "description"]) ||
  "Public action";

const getActionsForEvent = (event, actions) => {
  const eventId = preferredKeys(event, ["event_id", "id", "eventid"]);
  const groupId = preferredKeys(event, ["group_id", "groupid"]);
  const type = preferredKeys(event, ["type", "event_type", "category"]);

  const filtered = actions.filter((action) => {
    const actionEventId = preferredKeys(action, ["event_id", "eventid"]);
    const actionGroupId = preferredKeys(action, ["group_id", "groupid"]);
    const actionType = preferredKeys(action, ["event_type", "type", "category"]);

    if (actionEventId && eventId && actionEventId === eventId) return true;
    if (actionGroupId && groupId && actionGroupId === groupId) return true;
    if (actionType && type && actionType === type) return true;
    return false;
  });

  return filtered.length ? filtered : actions;
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

const buildEventSection = (event, group, actions, media) => {
  const date = parseDateTime(event);
  const past = isPastEvent(date);
  const eventTitle = getEventTitle(event);
  const location = getLocation(event);
  const safeDate = Number.isNaN(date.getTime())
    ? new Date(8640000000000000)
    : date;

  const section = document.createElement("section");
  section.className = "event-section";
  section.dataset.datetime = safeDate.toISOString();

  const left = document.createElement("div");
  left.className = "event-left";

  const groupCard = document.createElement("div");
  groupCard.className = "card";
  const groupName = preferredKeys(group || {}, ["name", "group", "title"]) || "Group";
  groupCard.innerHTML = `<h3>${groupName}</h3><p>${getGroupSummary(group)}</p>`;
  left.appendChild(groupCard);

  const center = document.createElement("div");
  center.className = "event-center";

  const dot = document.createElement("div");
  dot.className = "event-dot";

  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.innerHTML = `
    <div class="event-date">${formatDate(date)}</div>
    <div class="event-time">${formatTime(date)}</div>
    <div class="event-location">${location}</div>
  `;

  center.appendChild(dot);
  center.appendChild(meta);

  const right = document.createElement("div");
  right.className = `event-right ${past ? "past" : ""}`;

  const actionsCard = document.createElement("div");
  actionsCard.className = "card";
  const actionList = document.createElement("div");
  actionList.className = "actions-list";
  const actionsForEvent = getActionsForEvent(event, actions);
  if (actionsForEvent.length) {
    actionsForEvent.forEach((action) => {
      const item = document.createElement("div");
      item.className = "action-chip";
      item.textContent = getActionLabel(action);
      actionList.appendChild(item);
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No public actions listed.";
    actionList.appendChild(empty);
  }
  actionsCard.innerHTML = `<h3>${eventTitle}</h3>`;
  actionsCard.appendChild(actionList);

  right.appendChild(actionsCard);

  if (past) {
    const bottom = document.createElement("div");
    bottom.className = "past-bottom";

    const scrollArea = document.createElement("div");
    scrollArea.className = "past-scroll";

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "media-list";
    mediaWrap.dataset.loaded = "false";

    const humanSummary = document.createElement("div");
    humanSummary.className = "summary-block";
    humanSummary.innerHTML = "<h4>Human summary</h4><p class=\"empty-state\">Loading...</p>";

    const aiSummary = document.createElement("div");
    aiSummary.className = "summary-block";
    aiSummary.innerHTML = "<h4>AI summary</h4><p class=\"empty-state\">Loading...</p>";

    scrollArea.appendChild(mediaWrap);
    scrollArea.appendChild(humanSummary);
    scrollArea.appendChild(aiSummary);

    bottom.appendChild(scrollArea);
    right.appendChild(bottom);

    const loadPastContent = async () => {
      if (mediaWrap.dataset.loaded === "true") return;
      mediaWrap.dataset.loaded = "true";
      mediaWrap.innerHTML = "";

      const mediaItems = getMediaForEvent(event, media);
      if (mediaItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No media listed for this event.";
        mediaWrap.appendChild(empty);
      } else {
        mediaItems.forEach((item) => {
          const mediaCard = document.createElement("div");
          mediaCard.className = "media-item";
          const title = preferredKeys(item, ["title", "name", "caption"]) || "Media";
          const url = preferredKeys(item, ["url", "link", "media_url", "video_url"]); 
          mediaCard.innerHTML = `<h4>${title}</h4>`;
          const embed = buildEmbed(url);
          if (embed) {
            mediaCard.appendChild(embed);
          }
          if (url) {
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Open source";
            mediaCard.appendChild(link);
          }
          mediaWrap.appendChild(mediaCard);
        });
      }

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

    section.addEventListener("section-visible", loadPastContent);
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

const snapScroll = (sections) => {
  let locked = false;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scrollToIndex = (index) => {
    if (!sections[index]) return;
    const behavior = prefersReduced ? "auto" : "smooth";
    sections[index].scrollIntoView({ behavior, block: "start" });
  };

  window.addEventListener(
    "wheel",
    (event) => {
      if (window.innerWidth < 1000) return;
      if (locked) return;
      const direction = Math.sign(event.deltaY);
      if (direction === 0) return;
      event.preventDefault();
      locked = true;
      const current = sections.findIndex((section) =>
        section.classList.contains("is-active")
      );
      const currentIndex = current === -1 ? 0 : current;
      const nextIndex = Math.min(
        Math.max(currentIndex + direction, 0),
        sections.length - 1
      );
      scrollToIndex(nextIndex);
      setTimeout(() => {
        locked = false;
      }, 650);
    },
    { passive: false }
  );

  return scrollToIndex;
};

const init = async () => {
  const [events, groups, actions, media] = await Promise.all([
    fetchCSV(DATA_FILES.events),
    fetchCSV(DATA_FILES.groups),
    fetchCSV(DATA_FILES.actions),
    fetchCSV(DATA_FILES.media),
  ]);

  if (!events.length) {
    loading.textContent = "No events found. Add data to events.csv.";
    return;
  }

  const groupsById = mapBy(groups, ["group_id", "id", "groupid"]);

  const sortedEvents = events
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
      return timeA - timeB;
    });

  loading.remove();

  const sections = sortedEvents.map((event) => {
    const groupId = preferredKeys(event, ["group_id", "groupid"]);
    const group = groupId ? groupsById.get(groupId) : null;
    return buildEventSection(event, group, actions, media);
  });

  sections.forEach((section) => timeline.appendChild(section));
  observeSections(sections);

  const scrollToIndex = snapScroll(sections);

  const now = new Date();
  let targetIndex = sections.findIndex((section) => {
    const date = new Date(section.dataset.datetime);
    return date.getTime() >= now.getTime();
  });
  if (targetIndex === -1) targetIndex = sections.length - 1;

  requestAnimationFrame(() => scrollToIndex(targetIndex));
};

init();
