# Public Transit Planner & Smart Commute Engine

PulseTransit AI multimodal urban navigation planner and live simulation platform.

## Setup Instructions

### MongoDB Compass

Start the local MongoDB server, then create a saved connection in MongoDB Compass:

- **Connection name:** `public transit planner`
- **Connection string:** `mongodb://127.0.0.1:27017`

The application creates the `public_transit_planner` database and its collections when data is first written. Searches are stored in `searches`, pass and ticket purchases in `purchases`, user profiles in `users`, and login events in `logins`.

For a MongoDB deployment that requires credentials, set `MONGODB_URI` in `server/.env` to its connection string and keep that file private. `MONGODB_DATABASE` selects the database name.

### Backend Express Server

```bash
cd server
npm install
npm start
```

The server connects to MongoDB before listening on port 5000. If MongoDB is unavailable or the URI is invalid, startup fails rather than silently switching to volatile in-memory storage.

The demo currently records an automatic app-session login for the built-in commuter profile (`Lokesh`). It does not implement password-based authentication. Do not treat this demo login as account security or add/store plaintext passwords.

Successful route searches, pass purchases, and ticket purchases are persisted in MongoDB. User/pass history is currently an unauthenticated local demo; add real authentication and authorization before exposing it to a network.
