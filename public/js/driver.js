document.addEventListener('DOMContentLoaded', function () {
    const pathParts = window.location.pathname.split('/');
    const driverId = pathParts[pathParts.length - 1];

    let driverData = null;
    let currentTab = 'pending';
    let activeRequests = [];
    let currentRequest = null;
    let navigationPhase = null;
    let map = null;
    let routeLayer = null;
    let driverMarker = null;
    let destinationMarker = null;
    let infoBoxControl = null;
    const ORS_API_KEY = '5b3ce3597851110001cf6248a9eb2e6c73314236a94dfb0ad2872f9f';
    let locationPermissionRequested = false;
    let isInitialRouteLoad = true;
    let isRefreshing = false;

    let locationWatchId = null;
    let locationUpdateInterval = null;
    const LOCATION_UPDATE_FREQUENCY = 2000;
    const DRIVER_ZOOM_LEVEL = 16;

    // DOM elements
    const driverNameElement = document.getElementById('driverName');
    const statusSelectElement = document.getElementById('statusSelect');
    const requestsListElement = document.getElementById('requestsList');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const requestsSection = document.getElementById('requests-section');
    const navigationSection = document.getElementById('navigation-section');
    const navigationFrameContainer = document.querySelector('.navigation-frame-container');
    const navigationPhaseInfo = document.getElementById('navigation-phase-info');
    const navToPickupBtn = document.getElementById('nav-to-pickup');
    const navToDropoffBtn = document.getElementById('nav-to-dropoff');
    const completeNavigationBtn = document.getElementById('complete-navigation');
    const simulateBtn = document.createElement('button');

    simulateBtn.id = 'simulate-driving';
    simulateBtn.textContent = 'Simulate Driving';
    simulateBtn.className = 'btn';
    simulateBtn.addEventListener('click', simulateDriving);
    document.querySelector('.navigation-controls').appendChild(simulateBtn);

    const header = document.querySelector('header .driver-info');
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.textContent = 'Logout';
    logoutBtn.style.backgroundColor = '#95a5a6';
    logoutBtn.style.color = 'white';
    logoutBtn.style.padding = '8px 15px';
    logoutBtn.style.borderRadius = '4px';
    logoutBtn.style.border = 'none';
    logoutBtn.style.cursor = 'pointer';
    logoutBtn.style.marginLeft = '10px';
    logoutBtn.addEventListener('click', function() {
        window.location.href = '/api/auth/logout';
    });
    header.appendChild(logoutBtn);

    const socket = io();

    fetchDriverData();
    fetchRequests();
    setupEventListeners();
    initializeLocationTracking();
    checkForActiveNavigation();

    function checkForActiveNavigation() {
        fetch('/api/requests')
            .then(response => response.json())
            .then(requests => {
                const activeRequest = requests.find(req =>
                    req.status === 'accepted' &&
                    req.driver_id === parseInt(driverId)
                );

                if (activeRequest) {
                    currentRequest = activeRequest;
                    isRefreshing = true;
                    showNavigation();
                    startNavigation('to_pickup');
                }
            })
            .catch(error => {
                console.error('Error checking for active navigation:', error);
            });
    }

    function setupEventListeners() {
        statusSelectElement.addEventListener('change', function () {
            const newStatus = this.value;
            updateDriverStatus(newStatus);
        });

        tabButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const tabName = this.dataset.tab;
                setActiveTab(tabName);
                renderRequestsList();
            });
        });

        socket.on('new_route_request', function (request) {
            fetchRequests();
        });

        socket.on('route_request_updated', function (request) {
            fetchRequests();
        });

        navToPickupBtn.addEventListener('click', function () {
            if (currentRequest && driverData) {
                startNavigation('to_pickup');
            }
        });

        navToDropoffBtn.addEventListener('click', function () {
            if (currentRequest) {
                startNavigation('to_dropoff');
            }
        });

        completeNavigationBtn.addEventListener('click', function () {
            if (currentRequest) {
                updateRequestStatus(currentRequest.id, 'completed');
                hideNavigation();
            }
        });
    }

    function fetchDriverData() {
        fetch(`/api/drivers/${driverId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Driver not found');
                }
                return response.json();
            })
            .then(driver => {
                driverData = driver;
                updateDriverUI();
            })
            .catch(error => {
                console.error('Error fetching driver data:', error);
                alert('Error: Driver not found. Redirecting to dispatch page.');
                window.location.href = '/dispatch';
            });
    }

    function updateDriverUI() {
        driverNameElement.textContent = driverData.name;
        statusSelectElement.value = driverData.status;
    }

    function updateDriverStatus(status) {
        fetch(`/api/drivers/${driverId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({status})
        })
            .then(response => response.json())
            .then(driver => {
                driverData = driver;
                updateDriverUI();
            })
            .catch(error => {
                console.error('Error updating driver status:', error);
                alert('Failed to update status. Please try again.');
                statusSelectElement.value = driverData.status;
            });
    }

    function updateDriverLocation(lat, lng) {
        fetch(`/api/drivers/${driverId}/location`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({lat, lng})
        })
            .then(response => response.json())
            .then(driver => {
                driverData = driver;

                if (map && (navigationPhase === 'to_pickup' || navigationPhase === 'to_dropoff')) {
                    if (driverMarker) {
                        driverMarker.setLatLng([lat, lng]);
                    } else {
                        driverMarker = L.marker([lat, lng]).addTo(map)
                            .bindPopup('Your Location');
                    }

                    if (currentRequest) {
                        let destLat, destLng;

                        if (navigationPhase === 'to_pickup') {
                            destLat = currentRequest.pickup_lat;
                            destLng = currentRequest.pickup_lng;
                        } else { // to_dropoff
                            destLat = currentRequest.dropoff_lat;
                            destLng = currentRequest.dropoff_lng;
                        }
                        updateRoute(lng, lat, destLng, destLat);
                        map.setView([lat, lng], DRIVER_ZOOM_LEVEL);
                    }
                }
            })
            .catch(error => {
                console.error('Error updating driver location:', error);
            });
    }

    function initializeLocationTracking() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const {latitude, longitude} = position.coords;
                    console.log(`Location acquired: ${latitude}, ${longitude}`);
                    updateDriverLocation(latitude, longitude);
                    setupLocationUpdates();
                },
                function (error) {
                    console.error('Geolocation error:', error);

                    if (error.code === error.PERMISSION_DENIED) {
                        alert('Location access denied. To use this app, please enable location access in your browser settings:\n\n1. Tap the lock/info icon in the address bar\n2. Select "Site settings"\n3. Enable "Location"\n4. Refresh the page');
                    } else {
                        alert('Location access is required for this application to function properly. Please enable location services and refresh the page.');
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    }

    function setupLocationUpdates() {
        if (locationUpdateInterval) {
            clearInterval(locationUpdateInterval);
        }

        locationUpdateInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const {latitude, longitude} = position.coords;
                    console.log(`Location updated: ${latitude}, ${longitude}`);
                    updateDriverLocation(latitude, longitude);
                },
                function (error) {
                    console.error('Error getting location:', error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        }, LOCATION_UPDATE_FREQUENCY);
    }

    function fetchRequests() {
        fetch('/api/requests')
            .then(response => response.json())
            .then(requests => {
                activeRequests = requests;
                renderRequestsList();
            })
            .catch(error => {
                console.error('Error fetching requests:', error);
            });
    }

    function setActiveTab(tabName) {
        currentTab = tabName;

        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function renderRequestsList() {
        requestsListElement.innerHTML = '';

        let filteredRequests = [];

        switch (currentTab) {
            case 'pending':
                filteredRequests = activeRequests.filter(req => req.status === 'pending');
                break;
            case 'accepted':
                filteredRequests = activeRequests.filter(req =>
                    req.status === 'accepted' && req.driver_id === parseInt(driverId)
                );
                break;
            case 'completed':
                filteredRequests = activeRequests.filter(req =>
                    (req.status === 'completed' || req.status === 'rejected') &&
                    req.driver_id === parseInt(driverId)
                );
                break;
        }

        if (filteredRequests.length === 0) {
            requestsListElement.innerHTML = `<p>No ${currentTab} requests</p>`;
            return;
        }

        filteredRequests
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(request => {
                const requestEl = document.createElement('div');
                requestEl.className = `request-item ${request.status}`;

                const createdAt = new Date(request.created_at);
                const formattedTime = createdAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

                let actionButtons = '';

                if (request.status === 'pending') {
                    actionButtons = `
                        <div class="request-actions">
                          <button class="btn btn-accept" data-request-id="${request.id}">Accept</button>
                          <button class="btn btn-reject" data-request-id="${request.id}">Reject</button>
                        </div>
                    `;
                } else if (request.status === 'accepted' && request.driver_id === parseInt(driverId)) {
                    actionButtons = `
                        <div class="request-actions">
                          <button class="btn btn-navigate" data-request-id="${request.id}">Navigate</button>
                          <button class="btn btn-complete" data-request-id="${request.id}">Complete</button>
                        </div>
                    `;
                }

                requestEl.innerHTML = `
                    <div class="request-header">
                        <h3>Request #${request.id}</h3>
                        <span class="status ${request.status}">${request.status}</span>
                    </div>
                    <div class="request-details">
                        <div><b>Created at:</b> ${formattedTime}</div>
                        <hr>
                        <div><b>Pickup:</b> ${request.pickup_name}</div>
                        <hr>
                        <div><b>Dropoff:</b> ${request.dropoff_name}</div>
                        <hr>
                        <div><b>Distance:</b> ~${request.distance}km</div>
                        <hr>
                        <div><b>Estimated time:</b> ~${request.estimated_time}m</div>
                    </div>
                    ${actionButtons}
                `;

                requestsListElement.appendChild(requestEl);
            });

        const acceptButtons = document.querySelectorAll('.btn-accept');
        const rejectButtons = document.querySelectorAll('.btn-reject');
        const completeButtons = document.querySelectorAll('.btn-complete');
        const navigateButtons = document.querySelectorAll('.btn-navigate');

        acceptButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const requestId = this.dataset.requestId;
                updateRequestStatus(requestId, 'accepted');
            });
        });

        rejectButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const requestId = this.dataset.requestId;
                const requestElement = this.closest('.request-item');
                if (requestElement) {
                    requestElement.remove();
                }
            });
        });

        completeButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const requestId = this.dataset.requestId;
                updateRequestStatus(requestId, 'completed');
            });
        });

        navigateButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                const requestId = this.dataset.requestId;
                currentRequest = activeRequests.find(r => r.id === parseInt(requestId));
                if (currentRequest) {
                    showNavigation();
                    startNavigation('to_pickup');
                }
            });
        });
    }

    function updateRequestStatus(requestId, status) {
        fetch(`/api/requests/${requestId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status,
                driver_id: driverId
            })
        })
            .then(response => response.json())
            .then(updatedRequest => {
                const index = activeRequests.findIndex(r => r.id === updatedRequest.id);
                if (index !== -1) {
                    activeRequests[index] = updatedRequest;
                }

                if (status === 'accepted') {
                    currentRequest = updatedRequest;
                    isInitialRouteLoad = true;

                    if (driverData.last_location_lat && driverData.last_location_lng) {
                        fetchETA(driverData.last_location_lat, driverData.last_location_lng, currentRequest.pickup_lat, currentRequest.pickup_lng)
                            .then(eta => {
                                console.log(`Driver sending ETA: ${eta} min for request ${requestId}`);
                                socket.emit('driver_eta', {
                                    driver_id: driverId,
                                    request_id: requestId, eta
                                });
                            })
                            .catch(error => console.error('Error calculating ETA:', error));
                    }

                    showNavigation();
                    startNavigation('to_pickup');
                } else if (status === 'completed' || status === 'rejected') {
                    currentRequest = null;
                    hideNavigation();
                }

                renderRequestsList();
            })
            .catch(error => {
                console.error('Error updating request status:', error);
                alert('Failed to update request status. Please try again.');
            });
    }

    function fetchETA(driverLat, driverLng, pickupLat, pickupLng) {
        const url = `http://192.168.0.153:8080/ors/v2/directions/driving-car?start=${driverLng},${driverLat}&end=${pickupLng},${pickupLat}`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    return Math.round(data.features[0].properties.summary.duration / 60);
                } else {
                    throw new Error('No route found');
                }
            });
    }

    function setupLeaflet() {
        navigationFrameContainer.innerHTML = '';

        const mapDiv = document.createElement('div');
        mapDiv.id = 'mapContainer';
        mapDiv.style.width = '100%';
        mapDiv.style.height = '600px';
        navigationFrameContainer.appendChild(mapDiv);

        map = L.map('mapContainer').setView([driverData.last_location_lat, driverData.last_location_lng], DRIVER_ZOOM_LEVEL);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        return map;
    }

    function showNavigation() {
        if (requestsSection) {
            requestsSection.style.display = 'none';
        }
        if (navigationSection) {
            navigationSection.style.display = 'block';
        }
    }

    function hideNavigation() {
        if (navigationSection) {
            navigationSection.style.display = 'none';
        }
        if (requestsSection) {
            requestsSection.style.display = 'block';
        }
        if (map) {
            map.remove();
            map = null;
        }
        routeLayer = null;
        driverMarker = null;
        destinationMarker = null;
        if (infoBoxControl) {
            infoBoxControl = null;
        }
    }

    function startNavigation(phase) {
        if (!currentRequest || !driverData) {
            console.error('Cannot start navigation: Missing request or driver data');
            return;
        }

        navigationPhase = phase;
        isInitialRouteLoad = true;

        if (!map) {
            map = setupLeaflet();
        }

        navigationPhaseInfo.textContent = phase === 'to_pickup' ? 'To Pickup Location' : 'To Dropoff Location';

        navToPickupBtn.disabled = phase === 'to_pickup';
        navToDropoffBtn.disabled = phase === 'to_dropoff';
        completeNavigationBtn.disabled = phase !== 'to_dropoff';

        let startLat, startLng, endLat, endLng;

        if (phase === 'to_pickup') {
            startLat = driverData.last_location_lat;
            startLng = driverData.last_location_lng;
            endLat = currentRequest.pickup_lat;
            endLng = currentRequest.pickup_lng;
        } else {
            startLat = currentRequest.pickup_lat;
            startLng = currentRequest.pickup_lng;
            endLat = currentRequest.dropoff_lat;
            endLng = currentRequest.dropoff_lng;
        }

        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });

            if (infoBoxControl) {
                map.removeControl(infoBoxControl);
                infoBoxControl = null;
            }
        }

        driverMarker = L.marker([startLat, startLng]).addTo(map)
            .bindPopup(phase === 'to_pickup' ? 'Your Location' : 'Pickup Location');

        destinationMarker = L.marker([endLat, endLng]).addTo(map)
            .bindPopup(phase === 'to_pickup' ? 'Pickup Location' : 'Dropoff Location');

        if (isInitialRouteLoad) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'loading-indicator';
            loadingIndicator.textContent = 'Loading route...';
            loadingIndicator.style.position = 'absolute';
            loadingIndicator.style.top = '50%';
            loadingIndicator.style.left = '50%';
            loadingIndicator.style.transform = 'translate(-50%, -50%)';
            loadingIndicator.style.padding = '10px';
            loadingIndicator.style.backgroundColor = 'white';
            loadingIndicator.style.borderRadius = '5px';
            loadingIndicator.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
            loadingIndicator.style.zIndex = '1000';

            const mapContainer = document.querySelector('#mapContainer');
            if (mapContainer) {
                mapContainer.appendChild(loadingIndicator);
            }
        }

        getDirections(startLng, startLat, endLng, endLat);
    }

    function updateRoute(startLng, startLat, endLng, endLat) {
        const url = `http://192.168.0.153:8080/ors/v2/directions/driving-car?start=${startLng},${startLat}&end=${endLng},${endLat}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to get directions');
                }
                return response.json();
            })
            .then(data => {
                if (data.features && data.features.length > 0) {
                    const routeCoordinates = data.features[0].geometry.coordinates;
                    const latLngs = routeCoordinates.map(coord => [coord[1], coord[0]]);

                    if (routeLayer) {
                        map.removeLayer(routeLayer);
                    }

                    routeLayer = L.polyline(latLngs, {
                        color: '#3498db',
                        weight: 5,
                        opacity: 0.7
                    }).addTo(map);

                    const routeSummary = data.features[0].properties.summary;
                    const distance = (routeSummary.distance / 1000).toFixed(1);
                    const duration = Math.round(routeSummary.duration / 60);

                    if (infoBoxControl) {
                        map.removeControl(infoBoxControl);
                    }

                    infoBoxControl = L.control({position: 'bottomleft'});
                    infoBoxControl.onAdd = function () {
                        const div = L.DomUtil.create('div', 'info-box');
                        div.innerHTML = `
                            <div style="background-color: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2);">
                                <strong>Distance:</strong> ${distance} km<br>
                                <strong>Estimated time:</strong> ${duration} min
                            </div>
                        `;
                        return div;
                    };
                    infoBoxControl.addTo(map);
                }
            })
            .catch(error => {
                console.error('Error updating route:', error);
            });
    }

    function getDirections(startLng, startLat, endLng, endLat) {
        const url = `http://192.168.0.153:8080/ors/v2/directions/driving-car?start=${startLng},${startLat}&end=${endLng},${endLat}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to get directions');
                }
                return response.json();
            })
            .then(data => {
                const indicator = document.getElementById('loading-indicator');
                if (indicator) {
                    indicator.remove();
                }

                if (data.features && data.features.length > 0) {
                    const routeCoordinates = data.features[0].geometry.coordinates;
                    const latLngs = routeCoordinates.map(coord => [coord[1], coord[0]]);

                    if (routeLayer) {
                        map.removeLayer(routeLayer);
                    }

                    routeLayer = L.polyline(latLngs, {
                        color: '#3498db',
                        weight: 5,
                        opacity: 0.7
                    }).addTo(map);

                    const routeSummary = data.features[0].properties.summary;
                    const distance = (routeSummary.distance / 1000).toFixed(1);
                    const duration = Math.round(routeSummary.duration / 60);

                    if (infoBoxControl) {
                        map.removeControl(infoBoxControl);
                    }

                    infoBoxControl = L.control({position: 'bottomleft'});
                    infoBoxControl.onAdd = function () {
                        const div = L.DomUtil.create('div', 'info-box');
                        div.innerHTML = `
                            <div style="background-color: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2);">
                                <strong>Distance:</strong> ${distance} km<br>
                                <strong>Estimated time:</strong> ${duration} min
                            </div>
                        `;
                        return div;
                    };
                    infoBoxControl.addTo(map);

                    if (isInitialRouteLoad) {
                        map.setView([startLat, startLng], DRIVER_ZOOM_LEVEL);
                        isInitialRouteLoad = false;
                    }
                } else {
                    alert('No route found. Please try again.');
                }
            })
            .catch(error => {
                const indicator = document.getElementById('loading-indicator');
                if (indicator) {
                    indicator.remove();
                }

                console.error('Error getting directions:', error);
                alert('Failed to get directions. Please try again.');
            });
    }

    function simulateDriving() {
        if (!routeLayer || !map) {
            alert('No active route to simulate driving on!');
            return;
        }

        const routePoints = routeLayer.getLatLngs();
        const totalPoints = routePoints.length;
        let currentPointIndex = 0;

        const simControlDiv = document.createElement('div');
        simControlDiv.id = 'simulation-controls';
        simControlDiv.innerHTML = `
    <div style="background-color: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.2); margin: 10px; position: absolute; top: 10px; right: 10px; z-index: 1000;">
        <h3>Simulation Controls</h3>
        <p>Point: <span id="sim-progress">0/${totalPoints}</span></p>
        <button id="sim-faster">Speed Up</button>
        <button id="sim-slower">Slow Down</button>
        <button id="sim-stop">Stop Simulation</button>
    </div>
`;
        document.querySelector('#mapContainer').appendChild(simControlDiv);

        const progressElement = document.getElementById('sim-progress');
        let simulationSpeed = 500;
        let lastApiUpdateTime = 0;
        const API_UPDATE_INTERVAL = 500;

        const originalUpdateDriverLocation = updateDriverLocation;
        let currentLat, currentLng;

        function updateDriverVisual(lat, lng) {
            currentLat = lat;
            currentLng = lng;

            if (map && driverMarker) {
                driverMarker.setLatLng([lat, lng]);

                map.setView([lat, lng], DRIVER_ZOOM_LEVEL);

                if (currentRequest && (navigationPhase === 'to_pickup' || navigationPhase === 'to_dropoff')) {
                    let destLat, destLng;

                    if (navigationPhase === 'to_pickup') {
                        destLat = currentRequest.pickup_lat;
                        destLng = currentRequest.pickup_lng;
                    } else { // to_dropoff
                        destLat = currentRequest.dropoff_lat;
                        destLng = currentRequest.dropoff_lng;
                    }
                    if (routeLayer) {
                        // We keep the existing route for simulation purposes
                    }
                }
            }
        }

        function updateDriverAPI() {
            const now = Date.now();
            if (now - lastApiUpdateTime >= API_UPDATE_INTERVAL) {
                lastApiUpdateTime = now;
                originalUpdateDriverLocation(currentLat, currentLng);
            }
        }

        updateDriverLocation = function(lat, lng) {
            updateDriverVisual(lat, lng);
            updateDriverAPI();
        };

        let simInterval = setInterval(() => {
            if (currentPointIndex >= totalPoints) {
                clearInterval(simInterval);
                updateDriverLocation = originalUpdateDriverLocation;
                alert('Simulation complete!');
                return;
            }

            const nextPoint = routePoints[currentPointIndex];
            updateDriverVisual(nextPoint.lat, nextPoint.lng);
            updateDriverAPI();

            progressElement.textContent = `${currentPointIndex}/${totalPoints}`;
            currentPointIndex++;
        }, simulationSpeed);

        document.getElementById('sim-faster').addEventListener('click', () => {
            simulationSpeed = Math.max(100, simulationSpeed - 100);
            clearInterval(simInterval);
            simInterval = setInterval(() => {
                if (currentPointIndex >= totalPoints) {
                    clearInterval(simInterval);
                    updateDriverLocation = originalUpdateDriverLocation;
                    alert('Simulation complete!');
                    return;
                }

                const nextPoint = routePoints[currentPointIndex];
                updateDriverVisual(nextPoint.lat, nextPoint.lng);
                updateDriverAPI();

                progressElement.textContent = `${currentPointIndex}/${totalPoints}`;
                currentPointIndex++;
            }, simulationSpeed);
        });

        document.getElementById('sim-slower').addEventListener('click', () => {
            simulationSpeed += 100;
            clearInterval(simInterval);
            simInterval = setInterval(() => {
                if (currentPointIndex >= totalPoints) {
                    clearInterval(simInterval);
                    updateDriverLocation = originalUpdateDriverLocation;
                    alert('Simulation complete!');
                    return;
                }

                const nextPoint = routePoints[currentPointIndex];
                updateDriverVisual(nextPoint.lat, nextPoint.lng);
                updateDriverAPI();

                progressElement.textContent = `${currentPointIndex}/${totalPoints}`;
                currentPointIndex++;
            }, simulationSpeed);
        });

        document.getElementById('sim-stop').addEventListener('click', () => {
            clearInterval(simInterval);
            updateDriverLocation = originalUpdateDriverLocation;
            document.getElementById('simulation-controls').remove();
        });
    }

    window.addEventListener('beforeunload', function () {
        if (locationUpdateInterval) {
            clearInterval(locationUpdateInterval);
        }
        if (locationWatchId) {
            navigator.geolocation.clearWatch(locationWatchId);
        }
    });
});
