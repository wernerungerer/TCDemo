require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'portal-photos-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Google OAuth login
app.get('/auth/google', (req, res) => {
  const oauth2Client = createOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/photoslibrary.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/?error=no_code');
  }
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;

    // Log granted scopes for debugging
    console.log('OAuth tokens received. Scopes:', tokens.scope || 'no scope field in token');

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    req.session.user = {
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture
    };

    res.redirect('/?login=success');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?error=auth_failed');
  }
});

// Check auth status
app.get('/auth/status', (req, res) => {
  if (req.session.tokens && req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Debug: check what scopes the current token has
app.get('/auth/debug-token', requireAuth, async (req, res) => {
  try {
    const tokenInfo = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${req.session.tokens.access_token}`
    );
    const data = await tokenInfo.json();
    console.log('Token info:', JSON.stringify(data, null, 2));
    res.json({
      granted_scopes: data.scope ? data.scope.split(' ') : [],
      expires_in: data.expires_in,
      error: data.error_description || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Helper to make authenticated Google Photos API calls
async function photosApiCall(req, url, options = {}) {
  const oauth2Client = createOAuth2Client();
  let tokens = req.session.tokens;
  oauth2Client.setCredentials(tokens);

  // Refresh token if needed
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    tokens = credentials;
    req.session.tokens = tokens; // Save refreshed tokens back to session
  }

  const fetchOptions = {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Photos API error: ${response.status} - ${text}`);
  }
  return response.json();
}

// List media items (photos)
app.get('/api/photos', requireAuth, async (req, res) => {
  try {
    const pageToken = req.query.pageToken || '';
    let url = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50';
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await photosApiCall(req, url);
    res.json(data);
  } catch (err) {
    console.error('List photos error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search media items
app.post('/api/photos/search', requireAuth, async (req, res) => {
  try {
    const data = await photosApiCall(
      req.session.tokens,
      'https://photoslibrary.googleapis.com/v1/mediaItems:search',
      {
        method: 'POST',
        body: JSON.stringify({
          pageSize: 50,
          pageToken: req.body.pageToken || '',
          filters: req.body.filters || {}
        })
      }
    );
    res.json(data);
  } catch (err) {
    console.error('Search photos error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List Google Photos albums
app.get('/api/albums', requireAuth, async (req, res) => {
  try {
    const pageToken = req.query.pageToken || '';
    let url = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50';
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await photosApiCall(req, url);
    res.json(data);
  } catch (err) {
    console.error('List albums error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get album contents
app.get('/api/albums/:albumId/photos', requireAuth, async (req, res) => {
  try {
    const data = await photosApiCall(
      req.session.tokens,
      'https://photoslibrary.googleapis.com/v1/mediaItems:search',
      {
        method: 'POST',
        body: JSON.stringify({
          albumId: req.params.albumId,
          pageSize: 50,
          pageToken: req.query.pageToken || ''
        })
      }
    );
    res.json(data);
  } catch (err) {
    console.error('Album photos error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MetaPortal Dashboards running on http://localhost:${PORT}`);
  console.log('Make sure to set up your Google OAuth credentials in .env');
});
