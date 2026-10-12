// Data fetching service connecting to Backend Server API
window.DataService = {
    async fetchTransitData() {
        try {
            const endpoint = (window.location.origin && window.location.origin.startsWith('http'))
                ? `${window.location.origin}/api/transit-data`
                : 'http://localhost:5000/api/transit-data';
            const res = await fetch(endpoint).catch(() => fetch('http://localhost:5000/api/transit-data'));
            if (res && res.ok) {
                return await res.json();
            }
            throw new Error("API Offline");
        } catch (e) {
            console.warn("Using fallback local data due to server state:", e);
            return {
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
        }
    },

    async fetchBookings() {
        try {
            const endpoint = (window.location.origin && window.location.origin.startsWith('http'))
                ? `${window.location.origin}/api/bookings`
                : 'http://localhost:5000/api/bookings';
            const res = await fetch(endpoint).catch(() => fetch('http://localhost:5000/api/bookings'));
            if (res && res.ok) {
                return await res.json();
            }
            return [];
        } catch (e) {
            console.warn("Could not fetch bookings from server:", e);
            return [];
        }
    },

    async fetchActivePass() {
        const endpoint = `${window.location.origin}/api/passes/active`;
        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`Pass lookup failed with HTTP ${res.status}.`);
            const data = await res.json();
            return data.activePass || null;
        } catch (error) {
            console.warn("Could not fetch active pass from server:", error);
            return null;
        }
    },

    async recordLogin(user) {
        const res = await fetch(`${window.location.origin}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.name, userId: user.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success || !data.user) {
            throw new Error(data.error || `Login record failed with HTTP ${res.status}.`);
        }
        return data.user;
    },

    async recordSearch(search) {
        const res = await fetch(`${window.location.origin}/api/searches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...search,
                userId: window.AppState?.currentUser?.id,
                userName: window.AppState?.currentUser?.name
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || `Search history save failed with HTTP ${res.status}.`);
        }
        return data.search;
    },

    async purchasePass(planId) {
        const endpoint = `${window.location.origin}/api/passes`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId,
                userId: window.AppState?.currentUser?.id,
                userName: window.AppState?.currentUser?.name
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success || !data.pass) {
            throw new Error(data.error || `Pass purchase failed with HTTP ${res.status}.`);
        }
        return data.pass;
    }
};