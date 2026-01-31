# Charleston County Actions Timeline

This repo is a static GitHub Pages site that renders a vertical, scroll-snapped
timeline from CSV files.

## Data inputs

Place these files at the repo root:

- `events.csv`
- `groups.csv`
- `actions.csv`
- `media.csv`
- `recaps/` folder containing recap text files in the format
  `<group_id>-<event_id>-<yyyymmdd>-human_summary.txt` or
  `<group_id>-<event_id>-<yyyymmdd>-ai_summary.txt`

The site reads these files directly in the browser, so keep them in the root of
this repo when deploying to GitHub Pages.

## Expected columns (flexible)

The app is resilient to common variations in column names, but the following
are the most useful:

- `events.csv`: `event_id`, `group_id`, `title`, `date`, `time`, `location`
- `groups.csv`: `group_id`, `name`, `summary`
- `actions.csv`: `event_id` or `group_id` or `event_type`, `action`
- `media.csv`: `event_id` or `group_id`, `title`, `url`

## Local preview

Open `index.html` directly in a browser or run a simple static server.
