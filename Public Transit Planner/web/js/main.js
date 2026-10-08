/**
 * Main Application Controller
 * Handles exact city geocoding, OSRM routing calculations, sidebar tab switches, and delay simulation.
 */

let activeRouteData = null;
let currentDelayState = false;

document.addEventListener('DOMContentLoaded', () => {
    if (window.initMap) window.initMap();
    setupEventListeners();
    setupTabSwitching();
});

function setupEventListeners() {
    const btnFind = document.getElementById('btn-find-routes');
    if (btnFind) {
        btnFind.addEventListener('click', handleRouteSearch);
    }

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

    const speedBtns = document.querySelectorAll('.btn-speed');
    speedBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            speedBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const speed = parseFloat(e.target.getAttribute('data-speed')) || 1;
            if (window.setSimSpeed) window.setSimSpeed(speed);
        });
    });

    const btnDelay = document.getElementById('btn-simulate-delay');
    if (btnDelay) {
        btnDelay.addEventListener('click', () => {
            currentDelayState = !currentDelayState;
            btnDelay.style.backgroundColor = currentDelayState ? '#ef4444' : '';
            btnDelay.style.color = currentDelayState ? '#ffffff' : '';
            btnDelay.innerText = currentDelayState ? '⚠️ Delay Active (+15m)' : '⚠️ Simulate Delay';
            if (window.toggleDelay) window.toggleDelay(currentDelayState);
        });
    }

    const btnPass = document.getElementById('btn-digital-pass');
    if (btnPass) {
        btnPass.addEventListener('click', () => {
            alert(`🎫 PulseTransit Digital Pass\n\nPass ID: PT-8829-X\nStatus: Active\nScope: Multimodal All-Access Pass`);
        });
    }
}

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
}

function renderTabContent(tabName) {
    const container = document.getElementById('results-container');
    if (!container) return;

    if (tabName === 'plan') {
        if (activeRouteData) {
            renderRouteCards(activeRouteData.origin, activeRouteData.dest, activeRouteData.durationMin, activeRouteData.distanceKm);
        } else {
            container.innerHTML = `<div style="color: #94a3b8; padding: 12px;">Select origin and destination to compute routes.</div>`;
        }
    } else if (tabName === 'lines') {
        container.innerHTML = `
            <div style="padding: 4px;">
                <h3 style="font-size: 13px; color: #06b6d4; margin-bottom: 10px;">📡 Active Transit Lines</h3>
                <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                    <strong style="color: #f8fafc; font-size: 12px;">Metro Line 1 (Red)</strong> - <span style="color: #10b981;">On Time</span>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Freq: 5m | Avg: 65 km/h</p>
                </div>
                <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px;">
                    <strong style="color: #f8fafc; font-size: 12px;">Express Highway Bus</strong> - <span style="color: #f59e0b;">Moderate Traffic</span>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Freq: 15m | Avg: 50 km/h</p>
                </div>
            </div>
        `;
    } else if (tabName === 'analytics') {
        container.innerHTML = `
            <div style="padding: 4px;">
                <h3 style="font-size: 13px; color: #06b6d4; margin-bottom: 10px;">📊 Transit Network Performance</h3>
                <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                    <span style="font-size: 11px; color: #94a3b8;">Route Efficiency Rating</span>
                    <h2 style="color: #10b981; margin-top: 2px; font-size: 18px;">95.4%</h2>
                </div>
                <div style="background: #141d33; border: 1px solid #1e293b; padding: 12px; border-radius: 8px;">
                    <span style="font-size: 11px; color: #94a3b8;">Daily CO₂ Reduction</span>
                    <h2 style="color: #06b6d4; margin-top: 2px; font-size: 18px;">1,420 kg</h2>
                </div>
            </div>
        `;
    }
}

/**
 * Handle Route Search via high-precision Nominatim Geocoding + OSRM
 */
async function handleRouteSearch() {
    const originStr = document.getElementById('origin-input')?.value.trim();
    const destStr = document.getElementById('dest-input')?.value.trim();
    const container = document.getElementById('results-container');

    if (!originStr || !destStr) {
        alert('Please specify both an origin and destination.');
        return;
    }

    container.innerHTML = `<div style="color: #06b6d4; padding: 15px; text-align: center;">🔍 Calculating real road geometry & travel metrics...</div>`;

    try {
        const originCoords = await geocodeCity(originStr);
        const destCoords = await geocodeCity(destStr);

        if (!originCoords || !destCoords) {
            container.innerHTML = `<div style="color: #ef4444; padding: 12px;">Could not geocode one or both cities. Please check city spelling.</div>`;
            return;
        }

        // Fetch routing data from OSRM driving engine
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        const routeData = await res.json();

        if (!routeData.routes || !routeData.routes.length) {
            container.innerHTML = `<div style="color: #ef4444; padding: 12px;">No direct route found between specified points.</div>`;
            return;
        }

        const route = routeData.routes[0];
        const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const durationMin = Math.round(route.duration / 60);
        const distanceKm = Math.round(route.distance / 1000);

        activeRouteData = { origin: originStr, dest: destStr, durationMin, distanceKm };

        if (window.plotRealRoute) {
            window.plotRealRoute(coordinates, originCoords, destCoords, durationMin, distanceKm);
        }

        renderRouteCards(originStr, destStr, durationMin, distanceKm);

    } catch (err) {
        console.error("Routing Error:", err);
        container.innerHTML = `<div style="color: #ef4444; padding: 12px;">Network error during route calculation. Please retry.</div>`;
    }
}

/**
 * Geocoding with full address response fallback
 */
async function geocodeCity(cityName) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                name: data[0].display_name.split(',')[0]
            };
        }
    } catch (e) {
        console.error("Geocode error:", e);
    }
    return null;
}

function renderRouteCards(origin, dest, durationMin, distanceKm) {
    const container = document.getElementById('results-container');
    const activeChip = document.querySelector('.chip.active')?.textContent.trim() || "Fastest";

    const formatTime = (mins) => {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        return hrs > 0 ? `${hrs} hrs ${m} mins` : `${m} mins`;
    };

    const basePrice = Math.max(100, Math.round(distanceKm * 1.8));

    let routes = [
        { title: "🚄 Express Intercity Train", badgeColor: "#06b6d4", duration: Math.round(durationMin * 0.85), price: `₹${Math.round(basePrice * 1.3)}`, transfers: "Direct", eco: "95%" },
        { title: "🚌 Express Highway Bus", badgeColor: "#a855f7", duration: Math.round(durationMin * 1.15), price: `₹${basePrice}`, transfers: "Direct", eco: "82%" },
        { title: "🚗 Shared Shuttle", badgeColor: "#10b981", duration: durationMin, price: `₹${Math.round(basePrice * 1.1)}`, transfers: "1 Stop", eco: "98%" }
    ];

    if (activeChip === "Cheapest") routes.sort((a, b) => parseInt(a.price.replace('₹','')) - parseInt(b.price.replace('₹','')));
    else if (activeChip === "Eco-Friendly") routes.sort((a, b) => parseInt(b.eco) - parseInt(a.eco));
    else routes.sort((a, b) => a.duration - b.duration);

    container.innerHTML = `
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px; display: flex; justify-content: space-between;">
            <span>Distance: <strong>${distanceKm} km</strong></span>
            <span>Sorted by: <strong>${activeChip}</strong></span>
        </div>
    ` + routes.map((r, i) => `
        <div style="background: #141d33; border: 1px solid ${i === 0 ? '#06b6d4' : '#1e293b'}; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="color: ${r.badgeColor}; font-weight: 700; font-size: 12px;">${r.title}</span>
                <span style="color: #10b981; font-weight: 700; font-size: 13px;">${formatTime(r.duration)}</span>
            </div>
            <p style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px;"><strong>${origin}</strong> &rarr; <strong>${dest}</strong></p>
            <div style="font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #1e293b; padding-top: 6px;">
                <span>💰 Price: <strong style="color: #f8fafc;">${r.price}</strong></span>
                <span>🔄 ${r.transfers}</span>
                <span>🌱 Eco: ${r.eco}</span>
            </div>
        </div>
    `).join('');
}