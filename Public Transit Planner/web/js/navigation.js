/**
 * Navigation & Map Module
 * Production-ready map management, high-accuracy OSRM routing, custom CSS vehicle markers, and smooth tracking.
 */

let map = null;
let routePolyline = null;
let liveVehicleMarker = null;
let heatmapLayer = null;
let trafficLayer = null;

let animationFrameId = null;
let currentPathCoords = [];
let animProgress = 0;
let totalDistanceKm = 0;
let simSpeedMultiplier = 1;
let isDelayed = false;

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

    // Default view centered on South India transit corridors
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([17.0000, 79.5000], 7);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    heatmapLayer = L.layerGroup().addTo(map);
    trafficLayer = L.layerGroup().addTo(map);

    setupMapLayerToggles();

    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
}

function setupMapLayerToggles() {
    const crowdToggle = document.getElementById('toggle-heatmap');
    const trafficToggle = document.getElementById('toggle-traffic');

    if (crowdToggle) {
        crowdToggle.replaceWith(crowdToggle.cloneNode(true));
        document.getElementById('toggle-heatmap').addEventListener('change', (e) => {
            if (e.target.checked) map.addLayer(heatmapLayer);
            else map.removeLayer(heatmapLayer);
        });
    }

    if (trafficToggle) {
        trafficToggle.replaceWith(trafficToggle.cloneNode(true));
        document.getElementById('toggle-traffic').addEventListener('change', (e) => {
            if (e.target.checked) map.addLayer(trafficLayer);
            else map.removeLayer(trafficLayer);
        });
    }
}

/**
 * Plots OSRM route, configures realistic vehicle marker, and begins medium-speed animation
 */
function plotRealRoute(coordinates, originCoords, destCoords, totalDurationMin, distanceKm) {
    if (!map || !coordinates || !coordinates.length) return;

    // Clear active map layers
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
        radius: 8, fillColor: '#06b6d4', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Origin: ${originCoords.name || ''}</b>`);

    L.circleMarker([destCoords.lat, destCoords.lng], {
        radius: 8, fillColor: '#a855f7', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Destination: ${destCoords.name || ''}</b>`);

    // 3. Render Crowd Heatmap & Traffic Congestion
    renderHeatmapAndTraffic(coordinates);

    // Fit map bounds to show route
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    // 4. Custom Inline Bus Marker (Self-contained CSS to prevent render crashes)
    const busVehicleIcon = L.divIcon({
        className: 'vehicle-marker-wrapper',
        html: `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                <!-- Distance Badge -->
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

                <!-- Bus Body Graphics -->
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
    animateVehicleAlongPath();
}

function renderHeatmapAndTraffic(coords) {
    if (!heatmapLayer || !trafficLayer) return;

    heatmapLayer.clearLayers();
    trafficLayer.clearLayers();

    const step = Math.max(1, Math.floor(coords.length / 8));

    for (let i = 0; i < coords.length; i += step) {
        const point = coords[i];

        // Crowd Density Circles
        L.circle(point, {
            radius: 1500,
            color: '#f59e0b',
            fillColor: '#ef4444',
            fillOpacity: 0.2,
            stroke: false
        }).addTo(heatmapLayer);

        // Congestion Segments
        if (i + 4 < coords.length && i % 2 === 0) {
            L.polyline([coords[i], coords[i + 4]], {
                color: '#ef4444',
                weight: 6,
                opacity: 0.65
            }).addTo(trafficLayer);
        }
    }
}

/**
 * Medium-paced smooth vehicle tracking
 */
function animateVehicleAlongPath() {
    if (!currentPathCoords.length || !liveVehicleMarker) return;

    const baseSpeed = 0.00015;
    const speedStep = isDelayed ? (baseSpeed * 0.3) : (baseSpeed * simSpeedMultiplier);

    animProgress += speedStep;

    if (animProgress > 1) animProgress = 0;

    const pointIndex = Math.floor(animProgress * (currentPathCoords.length - 1));
    const currentCoord = currentPathCoords[pointIndex];
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

function setSimSpeed(speed) { simSpeedMultiplier = speed; }
function toggleDelay(status) { isDelayed = status; }

window.initMap = initMap;
window.plotRealRoute = plotRealRoute;
window.setSimSpeed = setSimSpeed;
window.toggleDelay = toggleDelay;