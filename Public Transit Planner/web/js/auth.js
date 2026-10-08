// User authentication module
window.AuthModule = {
    getUser() {
        return window.AppState.currentUser;
    },
    isAuthenticated() {
        return !!window.AppState.currentUser;
    }
};