const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'public_transit_planner';

const sanitizeText = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    const clean = value.trim();
    return clean.length > 0 ? clean.slice(0, 120) : fallback;
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static frontend files from web folder
app.use(express.static(path.join(__dirname, '../web')));
app.use('/vendor/qrcodejs', express.static(path.join(__dirname, 'node_modules/qrcodejs')));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'public-transit-planner', timestamp: new Date().toISOString() });
});

// In-memory transit network snapshot; user data is persisted in MongoDB.
const TRANSIT_NETWORK = {
    stations: [
        { id: "st-1", name: "Central Metro Terminal", lat: 25.2048, lng: 55.2708, lines: ["M1", "M2"], crowd: "High (82%)" },
        { id: "st-2", name: "Financial Center Hub", lat: 25.2120, lng: 55.2780, lines: ["M1", "B10"], crowd: "Moderate (54%)" },
        { id: "st-3", name: "Tech District Park", lat: 25.2250, lng: 55.2890, lines: ["M2", "B12"], crowd: "Low (20%)" },
        { id: "st-4", name: "Harbor Promenade", lat: 25.1980, lng: 55.2520, lines: ["B10", "F1"], crowd: "High (78%)" },
        { id: "st-5", name: "Innovation Square", lat: 25.1850, lng: 55.2600, lines: ["M1"], crowd: "Moderate (45%)" }
    ],
    lines: [
        { id: "M1", name: "Line 1 - Red Metro", type: "metro", color: "#06b6d4" },
        { id: "M2", name: "Line 2 - Blue Express", type: "metro", color: "#6366f1" },
        { id: "B10", name: "Bus Route 10 - City Loop", type: "bus", color: "#f59e0b" },
        { id: "F1", name: "Harbor Ferry Express", type: "ferry", color: "#10b981" }
    ],
    vehicles: [
        { id: "v-101", lineId: "M1", name: "Metro 101", lat: 25.2048, lng: 55.2708, targetIndex: 1, speed: 0.00006, color: "#06b6d4", path: [[25.2048, 55.2708], [25.2120, 55.2780], [25.1850, 55.2600]] },
        { id: "v-102", lineId: "M2", name: "Metro 202", lat: 25.2250, lng: 55.2890, targetIndex: 0, speed: 0.00006, color: "#6366f1", path: [[25.2250, 55.2890], [25.2048, 55.2708]] },
        { id: "v-201", lineId: "B10", name: "City Bus 44", lat: 25.2120, lng: 55.2780, targetIndex: 1, speed: 0.00005, color: "#f59e0b", path: [[25.2120, 55.2780], [25.1980, 55.2520]] }
    ]
};

const PASS_PLANS = {
    day: { id: 'day', name: 'Day Pass', fare: '₹250', durationSeconds: 86400, description: 'Unlimited rides for one day' },
    week: { id: 'week', name: 'Weekly Pass', fare: '₹1,200', durationSeconds: 604800, description: 'Unlimited rides for seven days' },
    month: { id: 'month', name: 'Monthly Pass', fare: '₹3,500', durationSeconds: 2592000, description: 'Unlimited rides for thirty days' }
};
let database;
let searchesCollection;
let purchasesCollection;
let usersCollection;
let loginsCollection;

// API Endpoints
app.get('/api/transit-data', (req, res) => {
    res.json(TRANSIT_NETWORK);
});

app.get('/api/passes/active', async (req, res, next) => {
    try {
        const activePass = await purchasesCollection.findOne(
            { type: 'pass', expiresAt: { $gt: new Date() } },
            { sort: { purchasedAt: -1 }, projection: { _id: 0 } }
        );
        res.json({ activePass });
    } catch (error) {
        next(error);
    }
});

app.post('/api/passes', async (req, res, next) => {
    try {
        const plan = PASS_PLANS[req.body?.planId];
        if (!plan) {
            return res.status(400).json({ success: false, error: 'Choose a valid transit pass plan.' });
        }

        const purchasedAt = new Date();
        const passId = `PT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const expiresAt = new Date(purchasedAt.getTime() + plan.durationSeconds * 1000);
        const pass = {
            id: passId,
            passId,
            type: 'pass',
            userId: sanitizeText(req.body?.userId, 'USR-001'),
            userName: sanitizeText(req.body?.userName, 'Lokesh'),
            planId: plan.id,
            name: plan.name,
            fare: plan.fare,
            description: plan.description,
            durationSeconds: plan.durationSeconds,
            purchasedAt,
            expiresAt,
            qrPayload: JSON.stringify({
                issuer: 'PulseTransit',
                passId,
                planId: plan.id,
                expiresAt: expiresAt.toISOString()
            })
        };
        await purchasesCollection.insertOne(pass);
        const { type, ...responsePass } = pass;
        res.status(201).json({
            success: true,
            pass: { ...responsePass, purchasedAt: purchasedAt.toISOString(), expiresAt: expiresAt.toISOString() }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/purchases', async (req, res, next) => {
    try {
        const purchases = await purchasesCollection.find({}, { projection: { _id: 0 } })
            .sort({ purchasedAt: -1 })
            .limit(100)
            .toArray();
        res.json(purchases);
    } catch (error) {
        next(error);
    }
});

app.post('/api/bookings', async (req, res, next) => {
    try {
        const { routeId, fare, passId, title, origin, dest, duration } = req.body || {};

        const cleanedTitle = sanitizeText(title, 'Digital Transit Pass');
        const cleanedOrigin = sanitizeText(origin, 'Central Terminal');
        const cleanedDest = sanitizeText(dest, 'Tech Park');
        const cleanedFare = sanitizeText(fare, '₹150');
        const cleanedDuration = sanitizeText(duration, '30 mins');
        const cleanedPassId = sanitizeText(passId, 'PT-8829-X');
        const cleanedRouteId = sanitizeText(routeId, 'r-default');

        if (!cleanedTitle || !cleanedOrigin || !cleanedDest) {
            return res.status(400).json({ success: false, error: 'Booking requires a title, origin, and destination.' });
        }

        const newBooking = {
            id: `BK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            userId: sanitizeText(req.body?.userId, 'USR-001'),
            userName: sanitizeText(req.body?.userName, 'Lokesh'),
            routeId: cleanedRouteId,
            title: cleanedTitle,
            origin: cleanedOrigin,
            dest: cleanedDest,
            fare: cleanedFare,
            duration: cleanedDuration,
            passId: cleanedPassId,
            createdAt: new Date()
        };
        await purchasesCollection.insertOne({ ...newBooking, type: 'ticket' });
        res.status(201).json({
            success: true,
            booking: { ...newBooking, createdAt: newBooking.createdAt.toISOString() }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/bookings', async (req, res, next) => {
    try {
        const bookings = await purchasesCollection.find(
            { type: 'ticket' },
            { projection: { _id: 0, type: 0 } }
        ).sort({ createdAt: -1 }).limit(100).toArray();
        res.json(bookings.map(booking => ({
            ...booking,
            createdAt: booking.createdAt instanceof Date ? booking.createdAt.toISOString() : booking.createdAt
        })));
    } catch (error) {
        next(error);
    }
});

app.post('/api/searches', async (req, res, next) => {
    try {
        const origin = sanitizeText(req.body?.origin);
        const destination = sanitizeText(req.body?.destination);
        if (!origin || !destination) {
            return res.status(400).json({ success: false, error: 'Search requires an origin and destination.' });
        }

        const search = {
            userId: sanitizeText(req.body?.userId, 'USR-001'),
            userName: sanitizeText(req.body?.userName, 'Lokesh'),
            origin,
            destination,
            durationMin: Number.isFinite(req.body.durationMin) ? req.body.durationMin : null,
            distanceKm: Number.isFinite(req.body.distanceKm) ? req.body.distanceKm : null,
            searchedAt: new Date()
        };
        const result = await searchesCollection.insertOne(search);
        res.status(201).json({
            success: true,
            search: { ...search, id: result.insertedId.toString(), searchedAt: search.searchedAt.toISOString() }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/searches', async (req, res, next) => {
    try {
        const searches = await searchesCollection.find({}, { projection: { _id: 0 } })
            .sort({ searchedAt: -1 })
            .limit(100)
            .toArray();
        res.json(searches.map(search => ({
            ...search,
            searchedAt: search.searchedAt instanceof Date ? search.searchedAt.toISOString() : search.searchedAt
        })));
    } catch (error) {
        next(error);
    }
});

app.post('/api/login', async (req, res, next) => {
    try {
        const username = sanitizeText(req.body?.username, 'Lokesh');
        const user = await usersCollection.findOneAndUpdate(
            { username },
            {
                $set: { username, lastLoginAt: new Date() },
                $setOnInsert: { createdAt: new Date(), role: 'Commuter' },
                $inc: { loginCount: 1 }
            },
            { upsert: true, returnDocument: 'after' }
        );
        const loggedInUser = user && user.username ? user : user?.value;
        if (!loggedInUser) throw new Error('Login record could not be loaded after saving.');
        const loggedInAt = new Date();
        await loginsCollection.insertOne({
            userId: loggedInUser._id.toString(),
            username,
            loggedInAt,
            userAgent: sanitizeText(req.get('user-agent'), 'unknown')
        });
        res.json({
            success: true,
            user: {
                id: loggedInUser._id.toString(),
                name: loggedInUser.username,
                role: loggedInUser.role || 'Commuter'
            }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/logins', async (req, res, next) => {
    try {
        const logins = await loginsCollection.find({}, { projection: { _id: 0 } })
            .sort({ loggedInAt: -1 })
            .limit(100)
            .toArray();
        res.json(logins.map(login => ({
            ...login,
            loggedInAt: login.loggedInAt instanceof Date ? login.loggedInAt.toISOString() : login.loggedInAt
        })));
    } catch (error) {
        next(error);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
});

app.use((error, req, res, next) => {
    console.error('API request failed:', error);
    if (res.headersSent) return next(error);
    res.status(500).json({ success: false, error: 'A server error occurred while saving or loading data.' });
});

async function startServer() {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    database = client.db(MONGODB_DATABASE);
    searchesCollection = database.collection('searches');
    purchasesCollection = database.collection('purchases');
    usersCollection = database.collection('users');
    loginsCollection = database.collection('logins');
    await Promise.all([
        searchesCollection.createIndex({ searchedAt: -1 }),
        purchasesCollection.createIndex({ userId: 1, type: 1, purchasedAt: -1 }),
        purchasesCollection.createIndex({ userId: 1, type: 1, createdAt: -1 }),
        purchasesCollection.createIndex({ type: 1, createdAt: -1 }),
        usersCollection.createIndex({ username: 1 }, { unique: true }),
        loginsCollection.createIndex({ loggedInAt: -1 })
    ]);

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`MongoDB connected: ${MONGODB_DATABASE}`);
    });
}

startServer().catch(error => {
    console.error('Could not connect to MongoDB. Ensure MongoDB Compass/server is running and MONGODB_URI is correct.', error);
    process.exitCode = 1;
});