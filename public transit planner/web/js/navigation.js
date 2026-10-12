/**
 * Navigation & Map Module
 * Production-ready Leaflet map management, high-accuracy OSRM routing, custom CSS station and vehicle markers.
 */

let map = null;
let routePolyline = null;
let liveVehicleMarker = null;
let heatmapLayer = null;
let trafficLayer = null;

let animationFrameId = null;
let currentPathCoords = [];
let animProgress = 0;
let animDirection = 1;
let totalDistanceKm = 0;
let simSpeedMultiplier = 1;
let isDelayed = false;
let previousAnimationTime = 0;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function toJsString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    if (map) {
        map.remove();
        routePolyline = null;
        liveVehicleMarker = null;
        heatmapLayer = null;
        trafficLayer = null;
    }

    // Default view centered on Dubai / Middle East transit corridor or active station cluster
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([25.2048, 55.2708], 12);

    if (window.AppState) window.AppState.map = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    heatmapLayer = L.layerGroup().addTo(map);
    trafficLayer = L.layerGroup().addTo(map);

    setupMapLayerToggles();

    setTimeout(() => { 
        if (map) map.invalidateSize(); 
        renderStationMarkers();
        renderTransitVehicles();
    }, 200);
}

function setupMapLayerToggles() {
    const crowdToggle = document.getElementById('toggle-heatmap');
    const trafficToggle = document.getElementById('toggle-traffic');

    if (crowdToggle) {
        crowdToggle.addEventListener('change', (e) => {
            if (e.target.checked) map.addLayer(heatmapLayer);
            else map.removeLayer(heatmapLayer);
        });
    }

    if (trafficToggle) {
        trafficToggle.addEventListener('change', (e) => {
            if (e.target.checked) map.addLayer(trafficLayer);
            else map.removeLayer(trafficLayer);
        });
    }
}

function renderStationMarkers() {
    if (!map || !window.AppState || !window.AppState.transitNetwork) return;

    // Clear old station markers
    if (window.AppState.stationMarkers) {
        window.AppState.stationMarkers.forEach(m => map.removeLayer(m));
    }
    window.AppState.stationMarkers = [];

    const stations = window.AppState.transitNetwork.stations || [];
    const bounds = [];

    stations.forEach(st => {
        const marker = L.circleMarker([st.lat, st.lng], {
            radius: 9,
            fillColor: '#06b6d4',
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.95
        }).addTo(map);

        const safeStationName = escapeHtml(st.name);
        const jsSafeName = toJsString(st.name);
        const linesMarkup = st.lines ? st.lines.map(l => `<span style="background: #e2e8f0; padding: 1px 4px; border-radius: 4px; font-weight: bold;">${escapeHtml(l)}</span>`).join(' ') : '';

        const popupContent = `
            <div style="font-family: sans-serif; padding: 4px;">
                <strong style="color: #0f172a; font-size: 13px;">${safeStationName}</strong>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                    <div>Lines: ${linesMarkup}</div>
                    <div>Crowd: <strong style="color: #0284c7;">${escapeHtml(st.crowd || 'Moderate')}</strong></div>
                </div>
                <div style="margin-top: 8px; display: flex; gap: 4px;">
                    <button onclick="window.selectStationAsInput('${jsSafeName}', 'origin')" style="background: #06b6d4; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;">From Here</button>
                    <button onclick="window.selectStationAsInput('${jsSafeName}', 'dest')" style="background: #6366f1; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;">To Here</button>
                </div>
            </div>
        `;
        marker.bindPopup(popupContent);
        window.AppState.stationMarkers.push(marker);
        bounds.push([st.lat, st.lng]);
    });

    if (bounds.length > 0 && !currentPathCoords.length) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

function renderTransitVehicles() {
    if (!map || !window.AppState || !window.AppState.transitNetwork) return;

    if (window.AppState.vehicleMarkers) {
        window.AppState.vehicleMarkers.forEach(m => map.removeLayer(m));
    }
    window.AppState.vehicleMarkers = [];

    const vehicles = window.AppState.transitNetwork.vehicles || [];

    vehicles.forEach(v => {
        const vehicleIcon = L.divIcon({
            className: 'net-vehicle-marker',
            html: `
                <div style="
                    background: ${v.color || '#06b6d4'};
                    color: #fff;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 10px;
                    font-weight: bold;
                    border: 1px solid #ffffff;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
                    white-space: nowrap;
                ">
                    🚆 ${v.name}
                </div>
            `,
            iconSize: [60, 20],
            iconAnchor: [30, 10]
        });

        const m = L.marker([v.lat, v.lng], { icon: vehicleIcon }).addTo(map);
        v.markerInstance = m;
        window.AppState.vehicleMarkers.push(m);
    });
}

/**
 * Plots OSRM route, configures realistic vehicle marker, and begins smooth animation
 */
function plotRealRoute(coordinates, originCoords, destCoords, totalDurationMin, distanceKm) {
    if (!map || !coordinates || !coordinates.length) return;

    if (routePolyline) map.removeLayer(routePolyline);
    if (liveVehicleMarker) map.removeLayer(liveVehicleMarker);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    currentPathCoords = coordinates;
    totalDistanceKm = distanceKm;

    // 1. Draw Route Polyline
    routePolyline = L.polyline(coordinates, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.85
    }).addTo(map);

    // 2. Add Origin & Destination Pins
    L.circleMarker([originCoords.lat, originCoords.lng], {
        radius: 9, fillColor: '#06b6d4', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Origin: ${originCoords.name || ''}</b>`);

    L.circleMarker([destCoords.lat, destCoords.lng], {
        radius: 9, fillColor: '#a855f7', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Destination: ${destCoords.name || ''}</b>`);

    // 3. Render Crowd Heatmap & Traffic Congestion
    renderHeatmapAndTraffic(coordinates);

    // Fit map bounds to show route
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    // 4. Custom Vehicle Marker
    const busVehicleIcon = L.divIcon({
        className: 'vehicle-marker-wrapper',
        html: `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                <div id="live-vehicle-badge" style="
                    background: #10b981;
                    color: #ffffff;
                    font-weight: 700;
                    font-size: 11px;
                    padding: 3px 8px;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    white-space: nowrap;
                    margin-bottom: 4px;
                    border: 1px solid #ffffff;
                ">
                    0.0 / ${totalDistanceKm} km
                </div>
                <div style="
                    width: 48px;
                    height: 24px;
                    background: #2563eb;
                    border: 2px solid #ffffff;
                    border-radius: 6px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: space-evenly;
                    box-sizing: border-box;
                    padding: 0 2px;
                ">
                    <div style="width: 8px; height: 14px; background: #93c5fd; border-radius: 2px;"></div>
                    <div style="width: 6px; height: 12px; background: #bfdbfe; border-radius: 1px;"></div>
                    <div style="width: 6px; height: 12px; background: #bfdbfe; border-radius: 1px;"></div>
                    <div style="width: 6px; height: 12px; background: #bfdbfe; border-radius: 1px;"></div>
                </div>
            </div>
        `,
        iconSize: [100, 50],
        iconAnchor: [50, 25]
    });

    liveVehicleMarker = L.marker(coordinates[0], { icon: busVehicleIcon }).addTo(map);

    animProgress = 0;
    animDirection = 1;
    previousAnimationTime = 0;
    animateVehicleAlongPath();
}

function renderHeatmapAndTraffic(coords) {
    if (!heatmapLayer || !trafficLayer) return;

    heatmapLayer.clearLayers();
    trafficLayer.clearLayers();

    const step = Math.max(1, Math.floor(coords.length / 8));

    for (let i = 0; i < coords.length; i += step) {
        const point = coords[i];

        L.circle(point, {
            radius: 1500,
            color: '#f59e0b',
            fillColor: '#ef4444',
            fillOpacity: 0.2,
            stroke: false
        }).addTo(heatmapLayer);

        if (i + 4 < coords.length && i % 2 === 0) {
            L.polyline([coords[i], coords[i + 4]], {
                color: '#ef4444',
                weight: 6,
                opacity: 0.65
            }).addTo(trafficLayer);
        }
    }
}

function animateVehicleAlongPath() {
    if (!currentPathCoords.length || !liveVehicleMarker) return;

    const now = performance.now();
    const elapsedSeconds = previousAnimationTime
        ? Math.min((now - previousAnimationTime) / 1000, 0.25)
        : 0;
    previousAnimationTime = now;
    const cycleDurationSeconds = 180;
    const speedMultiplier = isDelayed ? simSpeedMultiplier * 0.3 : simSpeedMultiplier;

    animProgress += (elapsedSeconds * speedMultiplier) / cycleDurationSeconds * animDirection;
    if (animProgress >= 1 || animProgress <= 0) {
        animProgress = Math.max(0, Math.min(1, animProgress));
        animDirection *= -1;
    }

    const pointPosition = animProgress * (currentPathCoords.length - 1);
    const pointIndex = Math.floor(pointPosition);
    const nextPointIndex = Math.min(pointIndex + 1, currentPathCoords.length - 1);
    const pointFraction = pointPosition - pointIndex;
    const startCoord = currentPathCoords[pointIndex];
    const endCoord = currentPathCoords[nextPointIndex];
    const currentCoord = [
        startCoord[0] + (endCoord[0] - startCoord[0]) * pointFraction,
        startCoord[1] + (endCoord[1] - startCoord[1]) * pointFraction
    ];
    const coveredKm = (animProgress * totalDistanceKm).toFixed(1);

    if (currentCoord) {
        liveVehicleMarker.setLatLng(currentCoord);

        const badge = document.getElementById('live-vehicle-badge');
        if (badge) {
            badge.style.backgroundColor = isDelayed ? '#ef4444' : '#10b981';
            badge.innerHTML = isDelayed 
                ? `⚠️ DELAY: ${coveredKm} / ${totalDistanceKm} km`
                : `${coveredKm} / ${totalDistanceKm} km`;
        }
    }

    animationFrameId = requestAnimationFrame(animateVehicleAlongPath);
}

function setSimSpeed(speed) { 
    simSpeedMultiplier = speed; 
    if (window.AppState) window.AppState.simSpeed = speed;
}

function toggleDelay(status) { 
    isDelayed = status; 
    if (window.AppState) window.AppState.isDelayed = status;
}

window.selectStationAsInput = function(name, type) {
    if (type === 'origin') {
        const el = document.getElementById('origin-input');
        if (el) el.value = name;
    } else {
        const el = document.getElementById('dest-input');
        if (el) el.value = name;
    }
};

window.initMap = initMap;
window.renderStationMarkers = renderStationMarkers;
window.renderTransitVehicles = renderTransitVehicles;
window.plotRealRoute = plotRealRoute;
window.setSimSpeed = setSimSpeed;
window.toggleDelay = toggleDelay;