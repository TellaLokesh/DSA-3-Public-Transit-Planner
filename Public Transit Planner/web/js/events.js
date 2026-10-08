// Event Listeners and Simulation Loops
window.EventsModule = {
    bindEvents() {
        document.getElementById('search-routes-btn')?.addEventListener('click', () => {
            window.EventsModule.generateRoutes();
        });

        document.getElementById('toggle-tickets-modal')?.addEventListener('click', () => {
            document.getElementById('ticket-modal')?.classList.remove('hidden');
        });

        document.getElementById('close-ticket-modal')?.addEventListener('click', () => {
            document.getElementById('ticket-modal')?.classList.add('hidden');
        });
    },

    generateRoutes() {
        const container = document.getElementById('routes-container');
        if (!container) return;
        container.innerHTML = `
            <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-cyan-400">Optimal Multimodal</span>
                    <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">18 min</span>
                </div>
                <button onclick="window.BookingModule.createBooking('r1', 2.50)" class="w-full mt-2 py-1.5 bg-cyan-500/10 text-cyan-300 font-semibold text-xs rounded border border-cyan-500/30">
                    Book Digital Ticket ($2.50)
                </button>
            </div>
        `;
    },

    startSimulation() {
        setInterval(() => {
            if (window.AppState.simSpeed === 0) return;
            window.AppState.transitNetwork.vehicles.forEach(v => {
                if (!v.path || !v.markerInstance) return;
                const target = v.path[v.targetIndex];
                const dLat = target[0] - v.lat;
                const dLng = target[1] - v.lng;
                const dist = Math.sqrt(dLat * dLat + dLng * dLng);
                const step = v.speed * window.AppState.simSpeed;

                if (dist < step) {
                    v.lat = target[0];
                    v.lng = target[1];
                    v.targetIndex = (v.targetIndex + 1) % v.path.length;
                } else {
                    v.lat += (dLat / dist) * step;
                    v.lng += (dLng / dist) * step;
                }
                v.markerInstance.setLatLng([v.lat, v.lng]);
            });
        }, 1000 / 30);
    }
};