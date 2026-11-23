# 📚 Traccia Libri

> A private reading tracker for friend groups — log books, share thoughts, and stay in sync with your reading circle.

**Live site → [deltadidirac30.github.io/traccia-libri-sito](https://deltadidirac30.github.io/traccia-libri-sito/)**

---

## What is it?

Traccia Libri is a lightweight web app for small groups of readers who want to keep track of the books they read together. Each member can log their own books, share them with the group, leave likes and comments, and follow each other's reading activity — all in a clean, distraction-free interface.

No algorithms. No ads. Just your books and your people.

---

## Features

### 📖 Book Tracking
- Log every book you read with rich detail: title, author, publication year, page count, start/end dates, a favourite quote, a one-sentence summary, and personal notes
- Set each book as **private** (only you) or **shared** with a group
- Edit or delete your entries at any time, including changing visibility after the fact

### 👥 Reading Groups
- Create a group and invite friends with a shareable **invite code**
- Each group has a dedicated **Group Room** — a shared feed of all books the members have logged
- Group roles: **Admin** (creator) and **Member**
- Admins can remove members and delete the group; members can leave at any time

### ❤️ Social Interactions
- **Like** any book in your group with a heart toggle
- **Comment** on group books — leave reactions, thoughts, or questions
- Comments appear inline in the Group Room and on each book's detail page

### 👤 Profile & Activity
- Change your nickname, email address, or password from your profile page
- **Activity page** shows your stats at a glance (books logged, groups, likes given, comments written) and lists the last 5 interactions — sent and received — for both likes and comments

### 🔔 Notifications
- A bell in the navbar shows new books shared in your groups, likes on your books and comments
- Optional push notifications on phone and desktop (Profile → App e notifiche). On iPhone they work from the installed app (Share → Add to Home Screen)
- Notifications are created by database triggers; push is sent by the `send-push` Edge Function

### 📲 Installable
- Add it to the home screen like an app: own icon, full screen, works as a PWA (manifest + service worker)

### 📱 Fully Responsive
- Works on desktop and mobile
- Mobile-first hamburger navigation with all links accessible with one tap

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework) |
| Type & motion | Newsreader, Instrument Sans, IBM Plex Mono (Google Fonts) · [Motion](https://motion.dev) via CDN |
| Backend / Database | [Supabase](https://supabase.com) (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (email + password) |
| Hosting | GitHub Pages |

### Database highlights
- **Row Level Security** on every table — users can only read and write what they're allowed to
- **`SECURITY DEFINER` RPCs** for group operations that need to bypass RLS safely (joining via invite code, fetching member lists, removing members)
- Cascading deletes keep data consistent when groups or books are removed

---

## Pages

| Page | Description |
|---|---|
| `index.html` | Public landing page |
| `login.html` | Sign in / Sign up |
| `home.html` | Personal dashboard |
| `libri.html` | Global feed — all group books |
| `miei_libri.html` | Your books — edit, delete, change visibility |
| `gruppi.html` | Your groups — create or join via invite code |
| `stanza_gruppo.html` | Group Room — shared books, likes, comments, members |
| `aggiungi_libro.html` | Add a new book |
| `scheda.html` | Book detail with full social section |
| `profilo.html` | Change nickname, email, password |
| `attivita.html` | Activity stats and recent interactions |

---

## Getting Started (self-hosting)

1. **Fork** this repository
2. Create a free project on [supabase.com](https://supabase.com)
3. Run the full contents of `supabase_schema.sql` in the Supabase **SQL Editor**
4. Open `supabaseClient.js` and replace the two placeholder values:
   ```js
   const SUPABASE_URL  = 'https://your-project.supabase.co';
   const SUPABASE_ANON = 'your-anon-public-key';
   ```
5. In your Supabase project go to **Authentication → URL Configuration** and add your GitHub Pages URL to *Site URL* and *Redirect URLs*
6. Enable **GitHub Pages** on your fork (Settings → Pages → Deploy from `main`)

That's it — no build step, no dependencies to install.

---

## Project Structure

```
traccia_libri_sito/
├── index.html              # Landing page
├── login.html
├── home.html
├── libri.html
├── miei_libri.html
├── gruppi.html
├── stanza_gruppo.html
├── aggiungi_libro.html
├── scheda.html
├── profilo.html
├── attivita.html
├── style.css               # Single stylesheet — design system + all components
├── supabaseClient.js       # Supabase client, auth guard, shared utilities (icons, dates, book covers)
├── ui.js                   # Micro-animations with Motion (motion.dev), optional enhancement
├── pwa.js                  # Service worker registration, install prompt, push subscription
├── sw.js                   # Service worker: offline fallback + push notifications
├── manifest.webmanifest    # App name, icons, colours
├── icons/                  # App icons
├── vendor/                 # supabase-js and Motion, served by the site itself (see vendor/README.md)
├── supabase/
│   ├── migrations/006_notifications.sql
│   └── functions/send-push/index.ts
├── script.js               # Add book form
├── script_gruppi.js
├── script_libri_all.js
├── script_miei_libri.js
├── script_scheda.js
├── script_stanza_gruppo.js
├── script_profilo.js
├── script_attivita.js
├── supabase_schema.sql     # Full DB schema + migrations
└── reset_password.html
```

---

## License

MIT — use it, adapt it, share it freely.
