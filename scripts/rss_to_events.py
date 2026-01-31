#!/usr/bin/env python3
import csv
import html
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

RSS_URL = "https://www.charleston-sc.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml"
OUTPUT_PATH = Path("charleston/events.csv")

FIELDS = [
    "event_id",
    "group_id",
    "body_name",
    "event_type",
    "jurisdiction",
    "date",
    "time",
    "location",
    "address",
    "basis",
    "source_url",
    "notes",
]

GROUP_ID = "RSS"
BODY_NAME = "City of Charleston Calendar"
JURISDICTION = "City of Charleston"
BASIS = "City calendar RSS feed"
NOTES = "Generated from Charleston calendar RSS feed"

NS = {"cal": "https://www.charleston-sc.gov/Calendar.aspx"}


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_date(raw: str) -> str:
    if not raw:
        return ""
    raw = normalize_space(raw)
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def parse_time(raw: str) -> str:
    if not raw:
        return ""
    raw = normalize_space(raw)
    match = re.match(r"(\d{1,2}:\d{2}\s*[AP]M)", raw, re.IGNORECASE)
    if match:
        return match.group(1).upper().replace("  ", " ")
    return raw


def extract_description_fields(description: str):
    if not description:
        return "", "", ""
    desc = html.unescape(description)
    desc = desc.replace("\r", "")
    desc = re.sub(r"</?strong>", "", desc)
    parts = [p.strip() for p in re.split(r"<br\s*/?>", desc) if p.strip()]
    date_text = ""
    time_text = ""
    location_lines = []
    capture_location = False
    for part in parts:
        lower = part.lower()
        if lower.startswith("event date:"):
            date_text = part.split(":", 1)[1].strip()
            capture_location = False
            continue
        if lower.startswith("event time:"):
            time_text = part.split(":", 1)[1].strip()
            capture_location = False
            continue
        if lower.startswith("location:"):
            location = part.split(":", 1)[1].strip()
            if location:
                location_lines.append(location)
            capture_location = True
            continue
        if capture_location:
            location_lines.append(part)
    location = ", ".join([line for line in location_lines if line])
    return date_text, time_text, location


def clean_location(value: str) -> str:
    if not value:
        return ""
    value = normalize_space(value)
    if "Charleston" in value and " Charleston" not in value:
        value = value.replace("Charleston", " Charleston")
    return normalize_space(value)


def fetch_rss(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8")


def build_events(xml_text: str):
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []
    events = []
    for item in channel.findall("item"):
        title = html.unescape(item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or "").strip()

        event_dates = (item.findtext("cal:EventDates", namespaces=NS) or "").strip()
        event_times = (item.findtext("cal:EventTimes", namespaces=NS) or "").strip()
        event_location = (item.findtext("cal:Location", namespaces=NS) or "").strip()

        desc_date, desc_time, desc_location = extract_description_fields(
            item.findtext("description") or ""
        )

        date_value = parse_date(event_dates or desc_date)
        time_value = parse_time(event_times or desc_time)
        location_value = clean_location(desc_location or event_location)

        event_id_match = re.search(r"EID=(\d+)", link) or re.search(r"EID=(\d+)", guid)
        event_id = f"RSS-{event_id_match.group(1)}" if event_id_match else ""

        events.append(
            {
                "event_id": event_id,
                "group_id": GROUP_ID,
                "body_name": BODY_NAME,
                "event_type": title or "Event",
                "jurisdiction": JURISDICTION,
                "date": date_value,
                "time": time_value,
                "location": location_value,
                "address": location_value,
                "basis": BASIS,
                "source_url": link,
                "notes": NOTES,
            }
        )
    return events


def write_events(path: Path, events):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for event in events:
            writer.writerow(event)


def main():
    try:
        xml_text = fetch_rss(RSS_URL)
    except Exception as exc:
        print(f"Failed to fetch RSS feed: {exc}", file=sys.stderr)
        sys.exit(1)
    events = build_events(xml_text)
    if not events:
        print("No events parsed from RSS feed.", file=sys.stderr)
        sys.exit(1)
    write_events(OUTPUT_PATH, events)
    print(f"Wrote {len(events)} events to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
