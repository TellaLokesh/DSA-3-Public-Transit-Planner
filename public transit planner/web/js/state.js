// Application Global State Management
window.AppState = {
    map: null,
    simSpeed: 1,
    simInterval: null,
    userPassTimer: 0,
    transitNetwork: { stations: [], lines: [], vehicles: [] },
    routePolylines: [],
    stationMarkers: [],
    vehicleMarkers: [],
    currentUser: { id: "USR-001", name: "Lokesh", role: "Commuter" },
    activeBookings: [],
    activePass: null,
    isDelayed: false
};