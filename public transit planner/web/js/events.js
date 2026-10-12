// Event Listeners, Modal Handlers, and Background Simulation Loops
window.EventsModule = {
    bindEvents() {
        const btnFind = document.getElementById('btn-find-routes');
        if (btnFind) {
            btnFind.addEventListener('click', () => {
                if (window.handleRouteSearch) window.handleRouteSearch();
            });
        }
        ['origin-input', 'dest-input'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        if (window.handleRouteSearch) window.handleRouteSearch();
                    }
                });
            }
        });

        // Digital Pass Modal Triggers
        const btnPass = document.getElementById('btn-digital-pass');
        if (btnPass) {
            btnPass.addEventListener('click', () => this.openTicketModal());
        }

        const closeBtn = document.getElementById('close-ticket-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeTicketModal());
        }

        const passPlans = document.getElementById('pass-plans');
        if (passPlans) {
            passPlans.addEventListener('click', event => {
                const button = event.target.closest('.btn-buy-pass');
                if (button && window.BookingModule) {
                    window.BookingModule.purchasePass(button.dataset.planId);
                }
            });
        }

        const modalOverlay = document.getElementById('ticket-modal');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) this.closeTicketModal();
            });
        }

        // Speed controls
        const speedBtns = document.querySelectorAll('.btn-speed');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                speedBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const speed = parseFloat(e.target.getAttribute('data-speed')) || 1;
                if (window.setSimSpeed) window.setSimSpeed(speed);
            });
        });

        // Delay Toggle
        const btnDelay = document.getElementById('btn-simulate-delay');
        if (btnDelay) {
            btnDelay.addEventListener('click', () => {
                const isDelayed = !window.AppState.isDelayed;
                window.AppState.isDelayed = isDelayed;
                btnDelay.style.backgroundColor = isDelayed ? '#ef4444' : '';
                btnDelay.style.color = isDelayed ? '#ffffff' : '';
                btnDelay.innerText = isDelayed ? '⚠️ Delay Active (+15m)' : '⚠️ Simulate Delay';
                if (window.toggleDelay) window.toggleDelay(isDelayed);
            });
        }

        // Quick station selector tags
        const stationChips = document.querySelectorAll('.station-chip');
        stationChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const name = chip.getAttribute('data-station');
                const originInput = document.getElementById('origin-input');
                const destInput = document.getElementById('dest-input');

                if (!originInput.value.trim()) {
                    originInput.value = name;
                } else if (!destInput.value.trim()) {
                    destInput.value = name;
                } else {
                    originInput.value = name;
                }
            });
        });
    },

    openTicketModal() {
        const modal = document.getElementById('ticket-modal');
        if (modal) {
            modal.classList.add('active');
            if (window.BookingsListModule && typeof window.BookingsListModule.renderHistory === 'function') {
                window.BookingsListModule.renderHistory();
            }
        }
    },

    closeTicketModal() {
        const modal = document.getElementById('ticket-modal');
        if (modal) modal.classList.remove('active');
    },

    startSimulation() {
        // Vehicle Position Movement Interval
        let previousFrame = performance.now();
        setInterval(() => {
            const now = performance.now();
            const elapsedSeconds = Math.min((now - previousFrame) / 1000, 0.25);
            previousFrame = now;
            if (!window.AppState || window.AppState.simSpeed === 0) return;
            const vehicles = window.AppState.transitNetwork?.vehicles || [];
            vehicles.forEach(v => {
                if (!v.path || !v.markerInstance) return;
                const target = v.path[v.targetIndex];
                if (!target) return;

                const dLat = target[0] - v.lat;
                const dLng = target[1] - v.lng;
                const dist = Math.sqrt(dLat * dLat + dLng * dLng);
                const delayMultiplier = window.AppState.isDelayed ? 0.3 : 1;
                const step = v.speed * elapsedSeconds * (window.AppState.simSpeed || 1) * delayMultiplier;

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

        // Pass Timer Countdown Interval
        setInterval(() => {
            if (!window.AppState) return;
            if (window.AppState.userPassTimer > 0) {
                window.AppState.userPassTimer -= 1;
                const passTimerEl = document.getElementById('pass-timer-display');
                if (passTimerEl) {
                    passTimerEl.textContent = window.BookingsListModule.formatPassTimer(window.AppState.userPassTimer);
                }
                if (window.AppState.userPassTimer === 0) {
                    window.AppState.activePass = null;
                    if (window.BookingsListModule) window.BookingsListModule.renderHistory();
                }
            }
        }, 1000);
    }
};