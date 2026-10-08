// Ticket & Route booking handling
window.BookingModule = {
    async createBooking(routeId, fare) {
        try {
            const res = await fetch('http://localhost:5000/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routeId, fare })
            });
            const data = await res.json();
            if (data.success) {
                window.AppState.activeBookings.push(data.booking);
                alert("Pass/Ticket Booked Successfully!");
            }
        } catch (err) {
            console.error("Booking error:", err);
        }
    }
};