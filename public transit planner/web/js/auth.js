// User authentication module
window.AuthModule = {
    getUser() {
        return window.AppState ? window.AppState.currentUser : null;
    },
    isAuthenticated() {
        return !!(window.AppState && window.AppState.currentUser);
    },
    getPassId() {
        return window.AppState?.activePass?.passId || "PT-8829-X";
    }
};