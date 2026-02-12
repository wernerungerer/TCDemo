# Portal Photos

A touch-friendly web app to browse, organize, and slideshow your Google Photos on Facebook Portal devices.

## Features

- **Google Sign-In** — Authenticate with your Google account to access Google Photos
- **Browse & Select** — View your photos in a responsive grid with touch-friendly selection
- **Virtual Collections** — Group selected photos into named collections (stored locally in browser)
- **Slideshow Mode** — Play full-screen slideshows from one or more collections
- **Fullscreen Toggle** — Optimized for Portal's touch screen display

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Photos Library API**
4. Go to **APIs & Services → Credentials**
5. Create an **OAuth 2.0 Client ID** (Web application type)
6. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
   - For production, also add your deployed URL (e.g. `https://your-app.onrender.com/auth/google/callback`)
7. Go to **OAuth consent screen** and add your Google account as a test user

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=some-random-string
PORT=3000
```

### 3. Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

### 4. Access from Portal

To access from your Facebook Portal device, you need the app accessible over the network. Options:

**Option A: ngrok (quickest for testing)**
```bash
npx ngrok http 3000
```
Use the generated HTTPS URL on your Portal's browser. Remember to add it as an authorized redirect URI in Google Cloud Console.

**Option B: Deploy to Render.com (free tier)**
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repo
4. Set the environment variables in Render's dashboard
5. Deploy — use the Render URL on your Portal

## Tech Stack

- Node.js + Express
- Google Photos Library API (OAuth 2.0)
- Vanilla HTML/CSS/JS (no framework — fast loading on Portal)
- localStorage for collection persistence
