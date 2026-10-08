// Manage existing user bookings list UI
window.BookingsListModule = {
    renderHistory() {
        const container = document.getElementById('ride-history-list');
        if (!container) return;
        container.innerHTML = `
            <div class="p-2 bg-slate-900 border border-slate-800 rounded text-slate-300 flex justify-between">
                <span>Central -> Tech District</span>
                <span class="text-emerald-400 font-bold">$2.50</span>
            </div>
        `;
    }
};