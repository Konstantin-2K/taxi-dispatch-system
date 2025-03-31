document.addEventListener('DOMContentLoaded', function () {
    const map = L.map('map').setView([43.2141, 27.9147], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const socket = io();
    const ORS_API_KEY = '5b3ce3597851110001cf6248a9eb2e6c73314236a94dfb0ad2872f9f';

    const clearBtn = document.getElementById('clearBtn');
    const dispatchBtn = document.getElementById('dispatchBtn');
    const requestsList = document.getElementById('requestsList');
    const driversList = document.getElementById('driversList');
    const startPointInput = document.getElementById('startPoint');
    const endPointInput = document.getElementById('endPoint');
    const startPointAutocomplete = document.getElementById('startPointAutocomplete');
    const endPointAutocomplete = document.getElementById('endPointAutocomplete');

    let pickupMarker = null;
    let dropoffMarker = null;
    let routeLine = null;
    let pickupCoords = null;
    let dropoffCoords = null;
    let distance = null;
    let estimated_time = null;
    let driverMarkers = {};
    let driverETA = null;

    const header = document.querySelector('header .control-panel');
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.textContent = 'Logout';
    logoutBtn.style.backgroundColor = '#95a5a6';
    logoutBtn.style.color = 'white';
    logoutBtn.addEventListener('click', function() {
        window.location.href = '/api/auth/logout';
    });
    header.appendChild(logoutBtn);

    fetchDrivers();
    fetchRequests();

    map.on('click', function (e) {
        const latlng = e.latlng;

        if (!pickupMarker) {
            reverseGeocodeLocation(latlng)
                .then(data => {
                    const locationName = data ?
                        (data.display_name || 'Unnamed Location') :
                        'Unnamed Location';

                    pickupMarker = L.marker(latlng, {
                        icon: L.divIcon({
                            className: 'pickup-marker',
                            html: '<div style="background-color: #3498db; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })
                    }).addTo(map);

                    pickupCoords = {
                        lat: latlng.lat,
                        lng: latlng.lng,
                        name: locationName
                    };

                    startPointInput.value = locationName;
                    pickupMarker.bindPopup(locationName).openPopup();
                });
        } else if (!dropoffMarker) {
            reverseGeocodeLocation(latlng)
                .then(data => {
                    console.log(latlng);
                    const locationName = data ?
                        (data.display_name || 'Unnamed Location') :
                        'Unnamed Location';

                    dropoffMarker = L.marker(latlng, {
                        icon: L.divIcon({
                            className: 'dropoff-marker',
                            html: '<div style="background-color: #e74c3c; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })
                    }).addTo(map);

                    dropoffCoords = {
                        lat: latlng.lat,
                        lng: latlng.lng,
                        name: locationName
                    };

                    endPointInput.value = locationName;
                    dropoffMarker.bindPopup(locationName).openPopup();

                    routeLine = L.polyline([
                        [pickupCoords.lat, pickupCoords.lng],
                        [dropoffCoords.lat, dropoffCoords.lng]
                    ], {
                        color: '#3498db',
                        weight: 3,
                        opacity: 0.7,
                        dashArray: '5, 10'
                    }).addTo(map);

                    calculateRoute(pickupCoords, dropoffCoords);
                });
        }
    });

    function calculateRoute(pickup, dropoff) {
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${pickup.lng},${pickup.lat}&end=${dropoff.lng},${dropoff.lat}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to get directions');
                }
                return response.json();
            })
            .then(data => {
                if (data.features && data.features.length > 0) {
                    const routeSummary = data.features[0].properties.summary;
                    distance = (routeSummary.distance / 1000).toFixed(1);
                    estimated_time = Math.round(routeSummary.duration / 60);

                    dispatchBtn.disabled = false;
                } else {
                    alert('No route found. Please try again.');
                    dispatchBtn.disabled = true;
                }
            })
            .catch(error => {
                console.error('Error getting directions:', error);
                alert('Failed to get directions. Please try again.');
                dispatchBtn.disabled = true;
            });
    }

    clearBtn.addEventListener('click', function () {
        clearMapMarkers();
    });

    dispatchBtn.addEventListener('click', function () {
        if (pickupCoords && dropoffCoords) {
            createRouteRequest(
                pickupCoords.lat,
                pickupCoords.lng,
                dropoffCoords.lat,
                dropoffCoords.lng,
                pickupCoords.name,
                dropoffCoords.name,
                distance,
                estimated_time
            );
        }
    });

    function reverseGeocodeLocation(latlng) {
        return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`)
            .then(response => response.json())
            .catch(error => {
                console.error('Reverse geocoding error:', error);
                return null;
            });
    }

    let hoverMarker = null;

    function nominatimAutocomplete(input, autocompleteContainer, isPickup) {
        const performSearch = debounce(function () {
            const query = input.value;

            if (query.length < 2) {
                autocompleteContainer.innerHTML = '';
                return;
            }

            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&viewbox=27.809845,43.273468,28.042987,43.178448&bounded=1`)
                .then(response => response.json())
                .then(data => {
                    autocompleteContainer.innerHTML = '';
                    console.log(data);
                    data.forEach(feature => {
                        const div = document.createElement('div');
                        div.textContent = feature.display_name;
                        div.className = 'autocomplete-item';

                        div.addEventListener('mouseenter', function () {
                            if (hoverMarker) {
                                map.removeLayer(hoverMarker);
                            }

                            const coords = L.latLng(parseFloat(feature.lat), parseFloat(feature.lon));
                            hoverMarker = L.marker(coords, {
                                icon: L.divIcon({
                                    className: 'hover-marker',
                                    html: '<div style="background-color: #9b59b6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; opacity: 0.7;"></div>',
                                    iconSize: [16, 16],
                                    iconAnchor: [8, 8]
                                })
                            }).addTo(map);

                            map.setView(coords, 15);
                        });

                        div.addEventListener('mouseleave', function () {
                            if (hoverMarker) {
                                map.removeLayer(hoverMarker);
                                hoverMarker = null;
                            }
                        });

                        div.addEventListener('click', function () {
                            if (hoverMarker) {
                                map.removeLayer(hoverMarker);
                                hoverMarker = null;
                            }

                            input.value = feature.display_name;
                            autocompleteContainer.innerHTML = '';

                            const coords = L.latLng(parseFloat(feature.lat), parseFloat(feature.lon));

                            if (isPickup) {
                                if (pickupMarker) {
                                    map.removeLayer(pickupMarker);
                                }

                                pickupMarker = L.marker(coords, {
                                    icon: L.divIcon({
                                        className: 'pickup-marker',
                                        html: '<div style="background-color: #3498db; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                                        iconSize: [16, 16],
                                        iconAnchor: [8, 8]
                                    })
                                }).addTo(map);

                                pickupCoords = {
                                    lat: coords.lat,
                                    lng: coords.lng,
                                    name: feature.display_name
                                };

                                pickupMarker.bindPopup('Pickup: ' + feature.display_name).openPopup();
                            } else {
                                if (dropoffMarker) {
                                    map.removeLayer(dropoffMarker);
                                }

                                dropoffMarker = L.marker(coords, {
                                    icon: L.divIcon({
                                        className: 'dropoff-marker',
                                        html: '<div style="background-color: #e74c3c; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                                        iconSize: [16, 16],
                                        iconAnchor: [8, 8]
                                    })
                                }).addTo(map);

                                dropoffCoords = {
                                    lat: coords.lat,
                                    lng: coords.lng,
                                    name: feature.display_name
                                };

                                dropoffMarker.bindPopup('Dropoff: ' + feature.display_name).openPopup();
                            }

                            if (pickupCoords && dropoffCoords) {
                                if (routeLine) {
                                    map.removeLayer(routeLine);
                                }

                                routeLine = L.polyline([
                                    [pickupCoords.lat, pickupCoords.lng],
                                    [dropoffCoords.lat, dropoffCoords.lng]
                                ], {
                                    color: '#3498db',
                                    weight: 3,
                                    opacity: 0.7,
                                    dashArray: '5, 10'
                                }).addTo(map);

                                calculateRoute(pickupCoords, dropoffCoords);
                            }
                        });

                        autocompleteContainer.appendChild(div);
                    });
                })
                .catch(error => {
                    console.error('Error in Nominatim API search:', error);
                });
        }, 300);

        input.addEventListener('input', performSearch);
    }

    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    nominatimAutocomplete(startPointInput, startPointAutocomplete, true);
    nominatimAutocomplete(endPointInput, endPointAutocomplete, false);

    function createRouteRequest(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name, distance, estimated_time) {
        if (!distance || !estimated_time) {
            alert('Route information is incomplete. Please wait for route calculation to complete or try again.');
            return;
        }

        dispatchBtn.disabled = true;
        dispatchBtn.textContent = 'Dispatching...';

        fetch('/api/requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pickup_lat,
                pickup_lng,
                dropoff_lat,
                dropoff_lng,
                pickup_name,
                dropoff_name,
                distance,
                estimated_time
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Route request created:', data);
                clearMapMarkers();
            })
            .catch(error => {
                console.error('Error creating route request:', error);
                alert('Failed to create route request. Please try again.');
                dispatchBtn.disabled = false;
                dispatchBtn.textContent = 'Dispatch';
            });
    }

    function clearMapMarkers() {
        if (pickupMarker) {
            map.removeLayer(pickupMarker);
            pickupMarker = null;
        }

        if (dropoffMarker) {
            map.removeLayer(dropoffMarker);
            dropoffMarker = null;
        }

        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        startPointInput.value = '';
        endPointInput.value = '';

        startPointAutocomplete.innerHTML = '';
        endPointAutocomplete.innerHTML = '';

        pickupCoords = null;
        dropoffCoords = null;
        distance = null;
        estimated_time = null;
        dispatchBtn.disabled = true;
        dispatchBtn.textContent = 'Dispatch';
    }

    function clearDriverMarkers() {
        Object.values(driverMarkers).forEach(marker => {
            map.removeLayer(marker);
        });
        driverMarkers = {};
    }

    function updateDriverMarkersOnMap(drivers) {
        clearDriverMarkers();

        drivers.forEach(driver => {
            if (driver.status !== 'offline' &&
                driver.last_location_lat &&
                driver.last_location_lng) {

                const driverCoords = L.latLng(
                    driver.last_location_lat,
                    driver.last_location_lng
                );

                const driverIcon = L.divIcon({
                    className: 'driver-marker',
                    html: `
                        <div class="driver-marker-container">
                            <div class="driver-name-label">${driver.name}</div>
                            <div class="driver-dot ${driver.status}" style="background-color: ${driver.status === 'available' ? '#2ecc71' : '#f39c12'}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white;"></div>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [25, 35]
                });
                const marker = L.marker(driverCoords, {
                    icon: driverIcon
                }).addTo(map);
                const popupContent = `
                    <div class="driver-popup">
                        <h3>${driver.name}</h3>
                        <div>Status: <span class="${driver.status}">${driver.status}</span></div>
                        <div>ID: ${driver.id}</div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                driverMarkers[driver.id] = marker;
            }
        });
    }

    function fetchDrivers() {
        fetch('/api/drivers')
            .then(response => response.json())
            .then(drivers => {
                updateDriversList(drivers);
                updateDriverMarkersOnMap(drivers);
            })
            .catch(error => {
                console.error('Error fetching drivers:', error);
            });
    }

    setInterval(fetchDrivers, 5000);

    function fetchRequests() {
        fetch('/api/requests')
            .then(response => response.json())
            .then(requests => {
                updateRequestsList(requests);
            })
            .catch(error => {
                console.error('Error fetching requests:', error);
            });
    }

    function updateDriversList(drivers) {
        driversList.innerHTML = '';

        if (drivers.length === 0) {
            driversList.innerHTML = '<p>No drivers available</p>';
            return;
        }

        drivers.forEach(driver => {
            const driverEl = document.createElement('div');
            driverEl.className = 'driver-item';

            let statusClass = '';
            switch (driver.status) {
                case 'available':
                    statusClass = 'available';
                    break;
                case 'busy':
                    statusClass = 'busy';
                    break;
                default:
                    statusClass = 'offline';
            }

            driverEl.innerHTML = `
        <h3>${driver.name}</h3>
        <div class="driver-details">
          <span class="status ${statusClass}">${driver.status}</span>
          <div>Driver ID: ${driver.id}</div>
        </div>
      `;

            driversList.appendChild(driverEl);
        });
    }

    function updateRequestsList(requests) {
        requestsList.innerHTML = '';

        if (requests.length === 0) {
            requestsList.innerHTML = '<p>No active requests</p>';
            return;
        }

        requests
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(request => {
                if (request.status !== "completed") {
                    const requestEl = document.createElement('div');
                    requestEl.className = `request-item ${request.status}`;

                    const createdAt = new Date(request.created_at);
                    const formattedTime = createdAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

                    const assignedDriver = request.driver_name
                        ? `<div>Assigned to: ${request.driver_name}</div>`
                        : '';

                    requestEl.innerHTML = `
                <h3>Request #${request.id}</h3>
                <div class="request-details">
                    <span class="status ${request.status}">${request.status}</span>
                    <div>Created at: ${formattedTime}</div>
                        ${assignedDriver}
                    <div>
                        Pickup: ${request.pickup_name}
                    </div>
                    <div>
                        Dropoff: ${request.dropoff_name}
                    </div>
                    <div>
                        Distance: ${request.distance} km
                    </div>
                    <div>
                        Est. Time: ${request.estimated_time} min
                    </div>
                </div>`;

                    requestEl.addEventListener('click', () => {
                        showRequestOnMap(request);
                    });

                    requestsList.appendChild(requestEl);
                }
            });
    }

    function showRequestOnMap(request) {
        clearMapMarkers();

        pickupCoords = {
            lat: parseFloat(request.pickup_lat),
            lng: parseFloat(request.pickup_lng),
            name: request.pickup_name
        };

        pickupMarker = L.marker([request.pickup_lat, request.pickup_lng], {
            icon: L.divIcon({
                className: 'pickup-marker',
                html: '<div style="background-color: #3498db; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        }).addTo(map);
        pickupMarker.bindPopup('Pickup Location for Request #' + request.id).openPopup();

        dropoffCoords = {
            lat: parseFloat(request.dropoff_lat),
            lng: parseFloat(request.dropoff_lng),
            name: request.dropoff_name
        };

        dropoffMarker = L.marker([request.dropoff_lat, request.dropoff_lng], {
            icon: L.divIcon({
                className: 'dropoff-marker',
                html: '<div style="background-color: #e74c3c; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        }).addTo(map);
        dropoffMarker.bindPopup('Dropoff Location for Request #' + request.id);

        routeLine = L.polyline([
            [request.pickup_lat, request.pickup_lng],
            [request.dropoff_lat, request.dropoff_lng]
        ], {
            color: '#3498db',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 10'
        }).addTo(map);

        routeLine.bindPopup(`
            Distance: ${request.distance} km<br>
            Est. Time: ${request.estimated_time} min
        `);

        const bounds = L.latLngBounds([
            [request.pickup_lat, request.pickup_lng],
            [request.dropoff_lat, request.dropoff_lng]
        ]);
        map.fitBounds(bounds, {padding: [50, 50]});
        distance = request.distance;
        estimated_time = request.estimated_time;
        dispatchBtn.disabled = true;
    }

    socket.on('new_route_request', function (request) {
        fetchRequests();
    });

    socket.on('route_request_updated', function (request) {
        fetchRequests();
    });

    socket.on('driver_status_changed', function (driver) {
        fetchDrivers();
    });

    socket.on('driver_location_changed', function (driver) {
        fetchDrivers();
    });

    socket.on('driver_eta', function (data) {
        const { request_id, eta } = data;

        const requestItems= document.querySelectorAll('.request-item');
        const matchingRequest = Array.from(requestItems).find(item => {
            const h3Element = item.querySelector('h3');
            return h3Element && h3Element.textContent.trim() === `Request #${request_id}`;
        })
        if (matchingRequest) {
            let etaElement = matchingRequest.querySelector('.eta-info');
            if (!etaElement) {
                etaElement = document.createElement('div');
                etaElement.className = 'eta-info';
                matchingRequest.appendChild(etaElement);
            }
            etaElement.innerHTML = `<strong>Driver ETA:</strong> ${eta} min`;
        }
    });


});
