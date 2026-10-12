// Ticket & Route booking handling module
window.BookingModule = {
    async purchasePass(planId) {
        const buttons = document.querySelectorAll('.btn-buy-pass');
        buttons.forEach(button => { button.disabled = true; });

        try {
            const pass = await window.DataService.purchasePass(planId);
            window.AppState.activePass = pass;
            window.AppState.userPassTimer = Math.max(0, Math.floor((Date.parse(pass.expiresAt) - Date.now()) / 1000));
            if (window.BookingsListModule) window.BookingsListModule.renderHistory();
            this.showToast(`✅ ${pass.name} activated. Your QR pass is ready.`);
        } catch (error) {
            console.error('Pass purchase error:', error);
            this.showToast(error.message || 'Could not purchase the pass. Please try again.');
        } finally {
            buttons.forEach(button => { button.disabled = false; });
        }
    },

    async createBooking(routeId, title, origin, dest, fare, duration) {
        const payload = {
            routeId: routeId || 'r-custom',
            userId: window.AppState?.currentUser?.id || 'USR-001',
            userName: window.AppState?.currentUser?.name || 'Lokesh',
            title: title || 'Multimodal Transit Ticket',
            origin: origin || 'Central Metro Terminal',
            dest: dest || 'Destination',
            fare: fare || '₹150',
            duration: duration || '25 mins',
            passId: window.AuthModule ? window.AuthModule.getPassId() : 'PT-8829-X'
        };

        try {
            const endpoint = (window.location.origin && window.location.origin.startsWith('http'))
                ? `${window.location.origin}/api/bookings`
                : 'http://localhost:5000/api/bookings';
            
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success || !data.booking) {
                throw new Error(data.error || `Booking failed with HTTP ${res.status}.`);
            }
            const bookingObj = data.booking;

            if (window.AppState) {
                window.AppState.activeBookings.unshift(bookingObj);
            }

            if (window.BookingsListModule && typeof window.BookingsListModule.renderHistory === 'function') {
                window.BookingsListModule.renderHistory();
            }

            // Show Toast & Open Ticket Modal
            this.showToast(`✅ Booked ${bookingObj.title} for ${bookingObj.fare}!`);
            if (window.EventsModule && typeof window.EventsModule.openTicketModal === 'function') {
                window.EventsModule.openTicketModal();
            }
        } catch (err) {
            console.error("Booking error:", err);
            this.showToast(err.message || "Could not process booking. Please try again.");
        }
    },

    showToast(msg) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'app-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }
};