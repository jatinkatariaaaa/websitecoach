# Smart Money Institute — website

Glassmorphism website for a Forex / Price Action / Smart Money Concepts online trading institute in India, with alternating dark and light sections.
Pure HTML + CSS + JS, no build step, no dependencies (Google Fonts only).

**Dark or light sections:** every `<section>` is dark by default. Add `theme-light` to its class list (for example `class="section theme-light"`) to turn it white; remove it to make it dark again. All colours live as tokens at the top of `css/style.css`.

## Folders

| Path | What it is |
| --- | --- |
| `website/` | The actual site. **Deploy this folder.** |
| `website/index.html` | All page content (sections, pricing, FAQ, footer, modal form) |
| `website/css/style.css` | Design system: colours, glass cards, layouts, animations, responsive rules |
| `website/js/main.js` | Interactions: animations, curriculum tabs, SMC chart walkthrough, live IST session clock, challenge calculator, form |
| `website/assets/3d/` | Original 3D renders (including the certificate). `.webp` files are used on the site, `.png` masters are for social posts/ads |
| `tools/server.js` | Small local server (no install needed) |
| `tools/3d-studio/` | three.js studio that renders the 3D images |

## Preview locally

```bash
node tools/server.js
```

Then open http://localhost:5173. You can also just double-click `website/index.html`.

## Deploy

Upload the `website` folder to any static host: Netlify (drag and drop), Vercel, Cloudflare Pages, GitHub Pages or Hostinger.

## Before going live

1. **Name check**: the brand is **Smart Money Institute** (logo mark: `assets/favicon.svg`). Confirm the domain and trademark are available before you print or advertise it.
2. **Mentor section**: name, photo (save as `assets/mentor.jpg` and swap in the `<img>` noted in the HTML), bio and stats.
3. **Contact & socials**: email, phone, Instagram/YouTube/Telegram/X links, and the Privacy / Terms / Refund policy pages.
4. **Lead form**: it only shows a success message right now. Connect it in `js/main.js` (look for `TODO`) to Formspree, Google Sheets, your CRM or WhatsApp.
5. **Program details**: feature lists, lesson counts, the weekly schedule timings and the stats bar are sensible defaults. Edit them to match what you actually offer.
6. **Photos**: the people photos (hero, About, "Four ways we teach", CTA pill) are free Unsplash stock images (Unsplash License: free for commercial use, no attribution required). They are saved locally in `website/assets/photos/`, so the site doesn't depend on Unsplash. To swap one for your own photo, replace the file (same name) or change the `src` in `index.html`.
7. **Certificate**: the 3D certificate shows "Your Name" and "Mentor" as sample text. Edit the text in `tools/3d-studio/studio.js` (asset `certificate`) and re-render if you want different wording.
8. **Testimonials**: there are none on purpose. Add real student reviews once you have them; don't use made-up ones.
9. **Social preview image**: change `og:image` to a full URL on your domain.
10. **Legal**: have the risk disclaimer and the "Is forex trading legal in India?" answer reviewed by a lawyer or CA (SEBI / RBI / FEMA rules apply).

## Re-render the 3D images (e.g. to change colours)

```bash
node tools/server.js
```

Open http://localhost:5173/studio/ and click **Render all & save**. Materials, colours and lighting live in `tools/3d-studio/studio.js`. The studio loads three.js from a CDN, so it needs internet.
