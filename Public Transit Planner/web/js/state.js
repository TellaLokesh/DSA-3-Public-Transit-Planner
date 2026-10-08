// Application Global State Management
window.AppState = {
    map: null,
    simSpeed: 1,
    simInterval: null,
    userPassTimer: 2700,
    transitNetwork: { stations: [], lines: [], vehicles: [] },
    routePolylines: [],
    stationMarkers: [],
    currentUser: { id: "USR-001", name: "Namish Aditya", role: "Commuter" },
    activeBookings: []
};