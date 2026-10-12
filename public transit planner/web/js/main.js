/**
 * Main Application Controller
 * High-precision station & city geocoding, OSRM routing calculations, sidebar tab switches, and live analytics.
 */

let activeRouteData = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch initial network data & user bookings from server or fallback
    if (window.DataService) {
        try {
            const user = await window.DataService.recordLogin(window.AppState.currentUser);
            window.AppState.currentUser = user;
            const nameEl = document.querySelector('.pass-user-name');
            if (nameEl) nameEl.textContent = user.name;
        } catch (error) {
            console.error('Login could not be recorded in MongoDB:', error);
        }

        const transitData = await window.DataService.fetchTransitData();
        if (transitData && window.AppState) {
            window.AppState.transitNetwork = transitData;
        }

        const bookings = await window.DataService.fetchBookings();
        if (bookings && window.AppState) {
            window.AppState.activeBookings = bookings;
        }

        const activePass = await window.DataService.fetchActivePass();
        if (window.AppState) {
            window.AppState.activePass = activePass;
            window.AppState.userPassTimer = activePass
                ? Math.max(0, Math.floor((Date.parse(activePass.expiresAt) - Date.now()) / 1000))
                : 0;
        }
    }

    // 2. Initialize Leaflet Map & Markers
    if (window.initMap) window.initMap();

    // 3. Bind Event Listeners & Start Simulation
    if (window.EventsModule) {
        window.EventsModule.bindEvents();
        window.EventsModule.startSimulation();
    }

    // 4. Setup Tab Switching & Initial Render
    setupTabSwitching();
});

function setupTabSwitching() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            const tabName = e.target.getAttribute('data-tab');
            renderTabContent(tabName);
        });
    });

    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            chips.forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            if (activeRouteData) {
                renderRouteCards(activeRouteData.origin, activeRouteData.dest, activeRouteData.durationMin, activeRouteData.distanceKm);
            }
        });
    });
}

function renderTabContent(tabName) {
    const container = document.getElementById('results-container');
    if (!container) return;

    if (tabName === 'plan') {
        if (activeRouteData) {
            renderRouteCards(activeRouteData.origin, activeRouteData.dest, activeRouteData.durationMin, activeRouteData.distanceKm);
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="map-icon">🗺️</div>
                    <p>Select origin and destination to compute live multimodal routes.</p>
                </div>
            `;
        }
    } else if (tabName === 'lines') {
        const lines = window.AppState?.transitNetwork?.lines || [];
        container.innerHTML = `
            <div style="padding: 4px;">
                <h3 style="font-size: 13px; color: #06b6d4; margin-bottom: 10px;">📡 Active Transit Lines</h3>
                ${lines.length > 0 ? lines.map(l => `
                    <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: #f8fafc; font-size: 12px;">
                                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${l.color}; margin-right: 6px;"></span>
                                ${l.name}
                            </strong>
                            <span style="color: #10b981; font-weight: bold; font-size: 11px;">Active</span>
                        </div>
                        <p style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Type: ${l.type.toUpperCase()} | Frequency: 6-12 min</p>
                    </div>
                `).join('') : '<p style="color: #94a3b8;">No live lines available.</p>'}
            </div>
        `;
    } else if (tabName === 'analytics') {
        const vehicles = window.AppState?.transitNetwork?.vehicles || [];
        container.innerHTML = `
            <div style="padding: 4px;">
                <h3 style="font-size: 13px; color: #06b6d4; margin-bottom: 10px;">📊 Transit Network Performance</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                    <div style="background: #141d33; border: 1px solid #1e293b; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 10px; color: #94a3b8;">Route Efficiency</span>
                        <h2 style="color: #10b981; margin-top: 2px; font-size: 18px;">95.4%</h2>
                    </div>
                    <div style="background: #141d33; border: 1px solid #1e293b; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 10px; color: #94a3b8;">CO₂ Reduction</span>
                        <h2 style="color: #06b6d4; margin-top: 2px; font-size: 18px;">1,420 kg</h2>
                    </div>
                </div>
                <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px;">
                    <span style="font-size: 11px; color: #94a3b8;">Active Fleet Tracking</span>
                    <p style="font-size: 12px; color: #f8fafc; font-weight: bold; margin-top: 4px;">
                        ${vehicles.length} Live Transit Units In Operations
                    </p>
                </div>
            </div>
        `;
    }
}

/**
 * Handle Route Search via Station Lookup or Nominatim Geocoding + OSRM
 */
async function handleRouteSearch() {
    const originInput = document.getElementById('origin-input');
    const destInput = document.getElementById('dest-input');
    const container = document.getElementById('results-container');
    const searchButton = document.getElementById('btn-find-routes');
    const originStr = originInput?.value.trim() || '';
    const destStr = destInput?.value.trim() || '';

    if (!originStr || !destStr) {
        showRouteMessage('Please enter both an origin and destination station or city.');
        if (!originStr) originInput?.focus();
        else destInput?.focus();
        return;
    }

    if (!container) {
        console.error('Route search results container is missing.');
        return;
    }

    if (searchButton) {
        searchButton.disabled = true;
        searchButton.dataset.originalText = searchButton.textContent;
        searchButton.textContent = 'Searching...';
    }
    showRouteMessage('Finding station/city locations and calculating route...', 'info');

    try {
        let originCoords = findStationCoords(originStr);
        let destCoords = findStationCoords(destStr);

        if (!originCoords) originCoords = await geocodeCity(originStr);
        if (!destCoords) destCoords = await geocodeCity(destStr);

        if (!originCoords || !destCoords) {
            const missing = [
                !originCoords ? `origin "${originStr}"` : '',
                !destCoords ? `destination "${destStr}"` : ''
            ].filter(Boolean).join(' and ');
            showRouteMessage(`Could not find ${missing}. Check the spelling or enter a nearby city or station.`);
            return;
        }

        const sameLocation = Math.abs(originCoords.lat - destCoords.lat) < 0.00001
            && Math.abs(originCoords.lng - destCoords.lng) < 0.00001;
        if (sameLocation) {
            showRouteMessage('Origin and destination are the same. Choose two different locations.');
            return;
        }

        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let res;
        try {
            res = await fetch(osrmUrl, { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
        if (!res.ok) throw new Error(`Route service returned HTTP ${res.status}.`);
        const routeData = await res.json();

        if (routeData.code !== 'Ok' || !Array.isArray(routeData.routes) || !routeData.routes.length) {
            showRouteMessage('No road route was found between these locations. Try nearby stations or another city name.');
            return;
        }

        const route = routeData.routes[0];
        if (!route.geometry?.coordinates?.length || !Number.isFinite(route.duration) || !Number.isFinite(route.distance)) {
            throw new Error('The route service returned incomplete route data.');
        }
        const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const durationMin = Math.max(5, Math.round(route.duration / 60));
        const distanceKm = Math.max(1, Math.round((route.distance / 1000) * 10) / 10);

        activeRouteData = { origin: originStr, dest: destStr, durationMin, distanceKm };

        if (window.plotRealRoute) {
            window.plotRealRoute(coordinates, originCoords, destCoords, durationMin, distanceKm);
        }

        renderRouteCards(originStr, destStr, durationMin, distanceKm);
        try {
            await window.DataService.recordSearch({ origin: originStr, destination: destStr, durationMin, distanceKm });
        } catch (error) {
            console.error('Route search could not be saved in MongoDB:', error);
            if (window.BookingModule) window.BookingModule.showToast('Route found, but search history could not be saved.');
        }

    } catch (err) {
        console.error("Routing Error:", err);
        const message = err.name === 'AbortError'
            ? 'Route search timed out. Please retry.'
            : 'Could not calculate the route. Check your internet connection and try again.';
        showRouteMessage(message);
    } finally {
        if (searchButton) {
            searchButton.disabled = false;
            searchButton.textContent = searchButton.dataset.originalText || '🔍 Find Smart Bus Routes';
            delete searchButton.dataset.originalText;
        }
    }
}

function showRouteMessage(message, type = 'error') {
    const container = document.getElementById('results-container');
    if (!container) return;
    const notice = document.createElement('div');
    notice.setAttribute('role', type === 'error' ? 'alert' : 'status');
    notice.style.cssText = `color: ${type === 'error' ? '#ef4444' : '#06b6d4'}; padding: 15px; text-align: center;`;
    notice.textContent = message;
    container.replaceChildren(notice);
}

function findStationCoords(name) {
    const stations = window.AppState?.transitNetwork?.stations || [];
    const normalize = value => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const normalizedName = normalize(name);
    const queryTokens = normalizedName.split(/\s+/).filter(token => token.length >= 3);
    const match = stations.find(station => normalize(station.name) === normalizedName)
        || stations.find(station => {
            const stationName = normalize(station.name);
            const stationTokens = stationName.split(/\s+/);
            return stationName.startsWith(normalizedName)
                || normalizedName.startsWith(stationName)
                || (queryTokens.length > 0 && queryTokens.every(token => stationTokens.includes(token)));
        });
    if (match) {
        return { lat: match.lat, lng: match.lng, name: match.name };
    }
    return null;
}

async function geocodeCity(cityName) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(cityName)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
        res = await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`Location search returned HTTP ${res.status}.`);

    const data = await res.json();
    const location = Array.isArray(data) ? data[0] : null;
    const lat = Number(location?.lat);
    const lng = Number(location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        lat,
        lng,
        name: location.display_name?.split(',')[0] || cityName
    };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function bindRouteBookingButtons() {
    const buttons = document.querySelectorAll('.btn-book-ticket');
    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const routeId = button.dataset.routeId;
            const routeTitle = button.dataset.routeTitle || 'Multimodal Transit Ticket';
            const origin = button.dataset.origin || 'Central Metro Terminal';
            const dest = button.dataset.dest || 'Destination';
            const fare = button.dataset.fare || '₹150';
            const duration = button.dataset.duration || '25 mins';

            if (window.BookingModule && typeof window.BookingModule.createBooking === 'function') {
                window.BookingModule.createBooking(routeId, routeTitle, origin, dest, fare, duration);
            }
        });
    });
}

function renderRouteCards(origin, dest, durationMin, distanceKm) {
    const container = document.getElementById('results-container');
    const activeChip = document.querySelector('.chip.active')?.textContent.trim() || "Fastest";

    const formatTime = (mins) => {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        return hrs > 0 ? `${hrs}h ${m}m` : `${m} mins`;
    };

    const basePriceNum = Math.max(50, Math.round(distanceKm * 12));

    let routes = [
        { id: "r1", title: "🚄 Express Metro Intercity", badgeColor: "#06b6d4", duration: Math.round(durationMin * 0.85), priceNum: Math.round(basePriceNum * 1.3), price: `₹${Math.round(basePriceNum * 1.3)}`, transfers: "Direct", transferCount: 0, eco: "95%" },
        { id: "r2", title: "🚌 Express City Bus", badgeColor: "#a855f7", duration: Math.round(durationMin * 1.15), priceNum: basePriceNum, price: `₹${basePriceNum}`, transfers: "Direct", transferCount: 0, eco: "82%" },
        { id: "r3", title: "🚗 Multimodal Shuttle", badgeColor: "#10b981", duration: durationMin, priceNum: Math.round(basePriceNum * 1.1), price: `₹${Math.round(basePriceNum * 1.1)}`, transfers: "1 Stop", transferCount: 1, eco: "98%" }
    ];

    if (activeChip === "Cheapest") routes.sort((a, b) => a.priceNum - b.priceNum);
    else if (activeChip === "Eco-Friendly") routes.sort((a, b) => parseInt(b.eco) - parseInt(a.eco));
    else if (activeChip === "Fewest Transfers") routes.sort((a, b) => a.transferCount - b.transferCount || a.duration - b.duration);
    else routes.sort((a, b) => a.duration - b.duration);

    const safeOrigin = escapeHtml(origin);
    const safeDest = escapeHtml(dest);

    container.innerHTML = `
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px; display: flex; justify-content: space-between;">
            <span>Distance: <strong>${distanceKm} km</strong></span>
            <span>Sorted by: <strong>${escapeHtml(activeChip)}</strong></span>
        </div>
    ` + routes.map((r, i) => `
        <div class="route-card ${i === 0 ? 'highlight' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="color: ${r.badgeColor}; font-weight: 700; font-size: 13px;">${escapeHtml(r.title)}</span>
                <span style="color: #10b981; font-weight: 700; font-size: 13px;">${formatTime(r.duration)}</span>
            </div>
            <p style="font-size: 11px; color: #cbd5e1; margin-bottom: 8px;"><strong>${safeOrigin}</strong> &rarr; <strong>${safeDest}</strong></p>
            <div style="font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #1e293b; padding-top: 8px; margin-bottom: 10px;">
                <span>💰 Price: <strong style="color: #f8fafc;">${r.price}</strong></span>
                <span>🔄 ${r.transfers}</span>
                <span>🌱 Eco: ${r.eco}</span>
            </div>
            <button
                class="btn-book-ticket"
                data-route-id="${escapeHtml(r.id)}"
                data-route-title="${escapeHtml(r.title)}"
                data-origin="${safeOrigin}"
                data-dest="${safeDest}"
                data-fare="${escapeHtml(r.price)}"
                data-duration="${escapeHtml(formatTime(r.duration))}"
            >
                🎫 Book Ticket (${r.price})
            </button>
        </div>
    `).join('');

    bindRouteBookingButtons();
}

window.handleRouteSearch = handleRouteSearch;