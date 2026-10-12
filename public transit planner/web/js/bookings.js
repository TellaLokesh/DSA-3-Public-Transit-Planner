// Manage existing user bookings list UI and Digital Pass state
window.BookingsListModule = {
    formatPassTimer(seconds) {
        const safeSeconds = Math.max(0, seconds);
        const hours = Math.floor(safeSeconds / 3600);
        const mins = Math.floor((safeSeconds % 3600) / 60);
        const secs = safeSeconds % 60;
        return hours > 0
            ? `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    renderHistory() {
        const container = document.getElementById('ride-history-list');
        const passTimerEl = document.getElementById('pass-timer-display');
        const passBadgeEl = document.getElementById('digital-pass-badge');
        const passNameEl = document.getElementById('active-pass-name');
        const passIdEl = document.getElementById('digital-pass-id');
        const qrContainer = document.getElementById('pass-qr-code');

        const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));

        const state = window.AppState;
        let activePass = state?.activePass || null;
        if (activePass && Date.parse(activePass.expiresAt) <= Date.now()) {
            state.activePass = null;
            state.userPassTimer = 0;
            activePass = null;
        }

        if (passTimerEl && state) {
            passTimerEl.textContent = activePass
                ? this.formatPassTimer(state.userPassTimer)
                : '--:--';
        }

        if (passNameEl) {
            passNameEl.textContent = activePass ? `${activePass.name.toUpperCase()} · DIGITAL PASS` : 'NO ACTIVE PLAN';
        }
        if (passIdEl) passIdEl.textContent = activePass?.passId || 'Not purchased';
        if (passBadgeEl) {
            passBadgeEl.textContent = activePass ? `Active · ${activePass.name}` : 'No active pass';
            passBadgeEl.classList.toggle('status-active', Boolean(activePass));
        }
        if (qrContainer) {
            qrContainer.replaceChildren();
            if (activePass) {
                if (typeof window.QRCode === 'function') {
                    new window.QRCode(qrContainer, {
                        text: activePass.qrPayload,
                        width: 100,
                        height: 100,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: window.QRCode.CorrectLevel.M
                    });
                } else {
                    console.error('QR code library did not load.');
                    qrContainer.textContent = 'QR unavailable. Refresh to try again.';
                }
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'qr-placeholder';
                placeholder.textContent = 'Buy a pass to generate its QR code';
                qrContainer.appendChild(placeholder);
            }
        }

        if (!container) return;

        const bookings = state ? state.activeBookings : [];
        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
                <div class="empty-bookings">
                    <div style="font-size: 24px; margin-bottom: 4px;">🎫</div>
                    <p style="font-size: 12px; color: #94a3b8;">No active tickets yet. Find a route and click "Book Ticket" to purchase.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = bookings.map(b => `
            <div class="booking-card-item">
                <div class="booking-card-header">
                    <span class="booking-title">${escapeHtml(b.title || 'Transit Ticket')}</span>
                    <span class="booking-price">${escapeHtml(b.fare || '₹150')}</span>
                </div>
                <div class="booking-route">
                    <span>${escapeHtml(b.origin)}</span> &rarr; <span>${escapeHtml(b.dest)}</span>
                </div>
                <div class="booking-card-footer">
                    <span>ID: <strong>${escapeHtml(b.id)}</strong></span>
                    <span>Pass: <strong>${escapeHtml(b.passId || 'PT-8829-X')}</strong></span>
                    <span class="booking-status-tag">Valid</span>
                </div>
            </div>
        `).join('');
    }
};