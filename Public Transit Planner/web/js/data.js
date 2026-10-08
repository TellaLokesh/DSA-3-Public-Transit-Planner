// Data fetching service connecting to Backend Server API
window.DataService = {
    async fetchTransitData() {
        try {
            const res = await fetch('http://localhost:5000/api/transit-data');
            if (!res.ok) throw new Error("API Offline");
            return await res.json();
        } catch (e) {
            console.warn("Using fallback local data due to server state:", e);
            return {
                stations: [
                    { id: "st-1", name: "Central Metro Terminal", lat: 25.2048, lng: 55.2708, lines: ["M1", "M2"], crowd: "High (82%)" },
                    { id: "st-2", name: "Financial Center Hub", lat: 25.2120, lng: 55.2780, lines: ["M1", "B10"], crowd: "Moderate (54%)" },
                    { id: "st-3", name: "Tech District Park", lat: 25.2250, lng: 55.2890, lines: ["M2", "B12"], crowd: "Low (20%)" }
                ],
                lines: [
                    { id: "M1", name: "Line 1 - Red Metro", type: "metro", color: "#06b6d4" },
                    { id: "M2", name: "Line 2 - Blue Express", type: "metro", color: "#6366f1" }
                ],
                vehicles: [
                    { id: "v-101", lineId: "M1", name: "Metro 101", lat: 25.2048, lng: 55.2708, targetIndex: 1, speed: 0.0003, color: "#06b6d4", path: [[25.2048, 55.2708], [25.2120, 55.2780]] }
                ]
            };
        }
    }
};