# Apple UI kit

Apple style UI with the liquid glass tab bar. Light and dark mode built in.

## Files

- `apple-ui.css` — all the styles
- `apple-ui.js` — squircle corners, press effects, sliders, tab bar
- `demo.html` — every component on one page. Copy markup from here.

## How to use in a new project

1. Copy `apple-ui.css` and `apple-ui.js` into the project.
2. In every page:
   - in `<head>`: `<link rel="stylesheet" href="apple-ui.css">`
   - at the end of `<body>`: `<script src="apple-ui.js"></script>`
3. Copy the pieces you need from `demo.html`.

## Rules the kit relies on

- Cards get `data-sq="22"` so the JS draws Apple squircle corners.
- Real buttons get `data-press` (they bloom). List rows get `data-tap` (they only darken).
- Gold is only for premium things: streak, points, premium buttons. Blue for everything else.
- Tab bar works with any number of tabs. Listen for `tabchange` on `#bar`:
  ```js
  document.getElementById('bar').addEventListener('tabchange', e => {
    location.href = ['home.php', 'fitness.php', 'progress.php', 'profile.php'][e.detail.index];
  });
  ```

## Locked values (do not change)

| Setting | Value |
|---|---|
| Button bloom | 1.030 |
| Button bounce | 1.60 |
| Button speed | 260ms |
| Lens springiness | 160 |
| Lens wobble | 21.5 |
| Lens swell wide | 1.31 |
| Lens swell tall | 1.46 |
| Bar give | 5px |
| Icon zoom | 1.30 |
| Bar width | 360px |
| Bar thickness | 5px |

## Prompt for Claude Code in a new project

```
Use the UI kit in this folder (apple-ui.css, apple-ui.js, demo.html) for
every page. Read README.md and demo.html first.

- Do not create any other CSS or UI library. Add new styles to apple-ui.css.
- Build every screen from the kit's pieces: .page, .title, .sub, .lbl,
  .group/.row lists, .stats, .btn, .icon-btn, .seg, .field, .footer and
  the tab bar. Copy the markup exactly from demo.html.
- Cards need data-sq="22". Buttons need data-press. List rows need data-tap.
- Gold only for premium items. Blue for everything else.
- Do not change the locked animation values in apple-ui.js or the :root
  variables in apple-ui.css.
- It must work in both light and dark mode.
```
