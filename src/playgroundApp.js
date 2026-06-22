const TOKEN_STORAGE_KEY = "if.sample.flightTracker.tokens";
const OAUTH_STORAGE_KEY = "if.sample.flightTracker.oauth";
const LAYOUT_STORAGE_KEY = "if.sample.flightTracker.layout";
const SELECTED_SESSION_STORAGE_KEY = "if.sample.flightTracker.selectedSessionId";
const DEFAULT_LAYOUT = {
  leftWidth: 286,
  rightWidth: 320,
  bottomHeight: 248,
  showLeft: true,
  showRight: true,
  showBottom: true
};
const JSON_EAGER_CHILD_LIMIT = 60;
const JSON_MAX_RENDERED_CHILDREN = 180;

let config = window.IF_SAMPLE_CONFIG || {};
const L = window.L;

let els = null;

function collectElements() {
  return {
    map: document.querySelector("#map"),
    apiStatus: document.querySelector("#apiStatus"),
    loginButton: document.querySelector("#loginButton"),
    logoutButton: document.querySelector("#logoutButton"),
    profileName: document.querySelector("#profileName"),
    tokenExpiry: document.querySelector("#tokenExpiry"),
    profileAvatar: document.querySelector("#profileAvatar"),
    layoutButtons: Array.from(document.querySelectorAll("[data-layout-toggle]")),
    layoutResetButton: document.querySelector("[data-layout-reset]"),
    resizeHandles: Array.from(document.querySelectorAll("[data-resize-pane]")),
    sessionSelect: document.querySelector("#sessionSelect"),
    endpointCount: document.querySelector("#endpointCount"),
    endpointSearch: document.querySelector("#endpointSearch"),
    catalog: document.querySelector("#catalog"),
    mapTitle: document.querySelector("#mapTitle"),
    mapCount: document.querySelector("#mapCount"),
    inspectorTabs: Array.from(document.querySelectorAll("[data-inspector-tab]")),
    inspectorBody: document.querySelector("#inspectorBody"),
    networkDrawer: document.querySelector("#networkDrawer"),
    drawerHead: document.querySelector("#drawerHead"),
    drawerToggle: document.querySelector("#drawerToggle"),
    networkFilters: document.querySelector("#networkFilters"),
    networkStat: document.querySelector("#networkStat"),
    clearLogButton: document.querySelector("#clearLogButton"),
    logRows: document.querySelector("#logRows")
  };
}

const state = {
  sessions: [],
  selectedSession: null,
  flights: [],
  selectedFlight: null,
  atc: [],
  airports: [],
  selectedAirport: null,
  aircraftCatalog: [],
  selectedAircraftPackage: null,
  tracks: [],
  selectedUserId: null,
  selectedLogbookFlight: null,
  userAtcSessions: [],
  selectedUserAtcSession: null,
  organizations: [],
  selectedOrganization: null,
  liveAircraft: [],
  selectedLiveAircraft: null,
  schedules: [],
  selectedSchedule: null,
  selectedEntity: null,
  requests: [],
  requestFilter: "all",
  selectedRequestId: null,
  inspectorTab: "response",
  collapsedGroups: new Set(),
  layout: loadLayout()
};

let map = null;
let layers = null;
let refreshRequest = null;
let requestSequence = 0;
let tokenTimer = null;

const ENDPOINT_GROUPS = [
  {
    name: "Sessions",
    endpoints: [
      endpoint("GET", "sessions", () => "/v3/sessions", { geo: true, run: () => loadSessions({ autoSelect: false }) }),
      endpoint("GET", "session", () => `/v3/sessions/${sessionId()}`, { requires: () => Boolean(sessionId()) }),
      endpoint("GET", "session flights", () => `/v3/sessions/${sessionId()}/flights`, { requires: () => Boolean(sessionId()), run: () => loadFlights(sessionId()) })
    ]
  },
  {
    name: "Flights",
    endpoints: [
      endpoint("GET", "flight", () => `/v3/sessions/${sessionId()}/flights/${flightId()}`, { requires: () => Boolean(sessionId() && flightId()) }),
      endpoint("GET", "session flightplans", () => `/v3/flightplans/${sessionId()}`, { requires: () => Boolean(sessionId()) }),
      endpoint("GET", "flightplan", () => `/v3/sessions/${sessionId()}/flights/${flightId()}/flightplan`, { requires: () => Boolean(sessionId() && flightId()) }),
      endpoint("POST", "flightplans batch", () => `/v3/sessions/${sessionId()}/flights/flightplans`, {
        requires: () => Boolean(sessionId() && firstFlightIds().length),
        body: () => ({ flightIds: firstFlightIds() })
      }),
      endpoint("GET", "flight route", () => `/v3/sessions/${sessionId()}/flights/${flightId()}/route`, {
        requires: () => Boolean(sessionId() && flightId()),
        run: () => loadFlightRoute(sessionId(), flightId())
      })
    ]
  },
  {
    name: "ATC & World",
    endpoints: [
      endpoint("GET", "ATC", () => `/v3/sessions/${sessionId()}/atc`, { geo: true, requires: () => Boolean(sessionId()), run: () => loadAtc(sessionId()) }),
      endpoint("GET", "world", () => `/v3/sessions/${sessionId()}/world`, { requires: () => Boolean(sessionId()) }),
      endpoint("GET", "NOTAMs", () => `/v3/sessions/${sessionId()}/notams`, { requires: () => Boolean(sessionId()) }),
      endpoint("GET", "airport status", () => `/v3/sessions/${sessionId()}/airport/${airportIcao()}/status`, { requires: () => Boolean(sessionId() && airportIcao()) }),
      endpoint("GET", "airport ATIS", () => `/v3/sessions/${sessionId()}/airport/${airportIcao()}/atis`, { requires: () => Boolean(sessionId() && airportIcao()) })
    ]
  },
  {
    name: "Users",
    endpoints: [
      endpoint("GET", "user", () => `/v3/users/${currentUserId()}`, { requires: () => Boolean(currentUserId()) }),
      endpoint("POST", "users", () => "/v3/users", { requires: () => Boolean(currentUserId()), body: () => ({ userIds: [currentUserId()] }) }),
      endpoint("GET", "user flights", () => `/v3/users/${currentUserId()}/flights?pageSize=25&page=1`, {
        requires: () => Boolean(currentUserId()),
        run: () => loadUserFlights(currentUserId())
      }),
      endpoint("GET", "user flight", () => `/v3/users/${currentUserId()}/flights/${logbookFlightId()}`, { requires: () => Boolean(currentUserId() && logbookFlightId()) }),
      endpoint("GET", "user ATC", () => `/v3/users/${currentUserId()}/atc`, { requires: () => Boolean(currentUserId()), run: () => loadUserAtc(currentUserId()) }),
      endpoint("GET", "user ATC detail", () => `/v3/users/${currentUserId()}/atc/${userAtcSessionId()}`, { requires: () => Boolean(currentUserId() && userAtcSessionId()) })
    ]
  },
  {
    name: "Directory",
    endpoints: [
      endpoint("GET", "aircraft", () => "/v3/aircraft", { run: loadAircraftCatalog }),
      endpoint("GET", "aircraft by ID", () => `/v3/aircraft/${aircraftPackageId()}`, { requires: () => Boolean(aircraftPackageId()) }),
      endpoint("GET", "aircraft liveries", () => `/v3/aircraft/${aircraftPackageId()}/liveries`, { requires: () => Boolean(aircraftPackageId()) }),
      endpoint("GET", "all liveries", () => "/v3/aircraft/liveries"),
      endpoint("GET", "airports", () => "/v3/airports", { geo: true, run: loadAirports }),
      endpoint("GET", "airport", () => `/v3/airports/${airportIcao()}`, { geo: true, requires: () => Boolean(airportIcao()) }),
      endpoint("GET", "tracks", () => "/v3/tracks", { geo: true, run: loadTracks })
    ]
  },
  {
    name: "Live",
    endpoints: [
      endpoint("GET", "organizations", () => "/v3/live/organizations", { run: () => loadOrganizations(true) }),
      endpoint("GET", "organization", () => `/v3/live/organizations/${organizationId()}`, { requires: () => Boolean(organizationId()) }),
      endpoint("GET", "organization aircraft", () => `/v3/live/organizations/${organizationId()}/aircraft`, {
        requires: () => Boolean(organizationId()),
        run: () => loadLiveAircraft(organizationId())
      }),
      endpoint("GET", "live aircraft", () => `/v3/live/aircraft/${liveAircraftId()}`, { requires: () => Boolean(liveAircraftId()) }),
      endpoint("GET", "aircraft schedules", () => `/v3/live/aircraft/${liveAircraftId()}/schedules`, {
        requires: () => Boolean(liveAircraftId()),
        run: () => loadSchedules(liveAircraftId())
      }),
      endpoint("POST", "create schedule", () => `/v3/live/aircraft/${liveAircraftId()}/schedules`, {
        requires: () => Boolean(liveAircraftId()),
        body: createScheduleBody,
        confirmWrite: true
      }),
      endpoint("PUT", "update schedule", () => `/v3/live/schedules/${scheduleId()}`, {
        requires: () => Boolean(scheduleId()),
        body: updateScheduleBody,
        confirmWrite: true
      }),
      endpoint("PUT", "update flightplan", () => `/v3/live/schedules/${scheduleId()}/flightplan`, {
        requires: () => Boolean(scheduleId()),
        body: () => ({ flightPlan: "DCT" }),
        confirmWrite: true
      }),
      endpoint("PUT", "reorder schedules", () => `/v3/live/aircraft/${liveAircraftId()}/schedules/reorder`, {
        requires: () => Boolean(liveAircraftId() && scheduleId()),
        body: () => ({ scheduleId: scheduleId(), afterId: null }),
        confirmWrite: true
      }),
      endpoint("DELETE", "delete schedule", () => `/v3/live/schedules/${scheduleId()}`, {
        requires: () => Boolean(scheduleId()),
        confirmWrite: true
      })
    ]
  }
];

function endpoint(method, label, path, options = {}) {
  return { method, label, path, ...options };
}

const AircraftCanvasLayer = L.Layer.extend({
  options: {
    clickTolerance: 12,
    normalColor: "#ff9142",
    selectedColor: "#ffffff"
  },

  initialize(options = {}) {
    L.setOptions(this, options);
    this._flights = [];
    this._selectedFlightId = null;
    this._drawFrame = null;
    this._size = L.point(0, 0);
  },

  onAdd(activeMap) {
    this._map = activeMap;
    this._canvas = L.DomUtil.create("canvas", "aircraft-canvas-layer");
    this._context = this._canvas.getContext("2d", { alpha: true });
    activeMap.getContainer().appendChild(this._canvas);
    activeMap.on("move zoom resize viewreset", this._reset, this);
    activeMap.on("click", this._handleMapClick, this);
    this._reset();
  },

  onRemove(activeMap) {
    if (this._drawFrame) {
      cancelAnimationFrame(this._drawFrame);
      this._drawFrame = null;
    }

    activeMap.off("move zoom resize viewreset", this._reset, this);
    activeMap.off("click", this._handleMapClick, this);
    this._canvas?.remove();
    this._canvas = null;
    this._context = null;
    this._map = null;
  },

  setFlights(flights, selectedFlightId) {
    this._flights = Array.isArray(flights) ? flights : [];
    this._selectedFlightId = selectedFlightId || null;
    this._requestDraw();
  },

  setSelectedFlightId(selectedFlightId) {
    this._selectedFlightId = selectedFlightId || null;
    this._requestDraw();
  },

  clearLayers() {
    this.setFlights([], null);
  },

  _reset() {
    if (!this._map || !this._canvas) {
      return;
    }

    const size = this._map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(size.x * dpr));
    const height = Math.max(1, Math.round(size.y * dpr));

    this._size = size;
    this._dpr = dpr;
    if (this._canvas.width !== width || this._canvas.height !== height) {
      this._canvas.width = width;
      this._canvas.height = height;
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
    }

    this._requestDraw();
  },

  _requestDraw() {
    if (!this._map || !this._context || this._drawFrame) {
      return;
    }

    this._drawFrame = requestAnimationFrame(() => {
      this._drawFrame = null;
      this._draw();
    });
  },

  _draw() {
    if (!this._map || !this._context) {
      return;
    }

    const context = this._context;
    const dpr = this._dpr || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, this._size.x, this._size.y);

    const bounds = this._map.getBounds().pad(0.08);
    let selected = null;

    for (const flight of this._flights) {
      const point = getLatLng(flight);
      if (!point || !bounds.contains(point)) {
        continue;
      }

      const flightIdValue = getFlightId(flight);
      const layerPoint = this._map.latLngToContainerPoint(point);
      if (flightIdValue && flightIdValue === this._selectedFlightId) {
        selected = { flight, layerPoint };
        continue;
      }

      this._drawAircraft(layerPoint, getHeading(flight), false);
    }

    if (selected) {
      this._drawAircraft(selected.layerPoint, getHeading(selected.flight), true);
    }
  },

  _drawAircraft(point, heading, selected) {
    const context = this._context;
    context.save();
    context.translate(point.x, point.y);
    context.rotate((heading * Math.PI) / 180);
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(6, 7);
    context.lineTo(0, 4);
    context.lineTo(-6, 7);
    context.closePath();
    context.fillStyle = selected ? this.options.selectedColor : this.options.normalColor;

    if (selected) {
      context.shadowColor = "rgba(255, 255, 255, 0.75)";
      context.shadowBlur = 9;
    }

    context.fill();
    context.restore();
  },

  _handleMapClick(event) {
    const flight = this._nearestFlight(event.latlng);
    if (flight && this.options.onFlightClick) {
      this.options.onFlightClick(flight);
    }
  },

  _nearestFlight(latLng) {
    if (!this._map || this._flights.length === 0) {
      return null;
    }

    const clickPoint = this._map.latLngToContainerPoint(latLng);
    const tolerance = this.options.clickTolerance;
    let bestFlight = null;
    let bestDistance = tolerance * tolerance;

    for (const flight of this._flights) {
      const point = getLatLng(flight);
      if (!point) {
        continue;
      }

      const layerPoint = this._map.latLngToContainerPoint(point);
      const distance = clickPoint.distanceTo(layerPoint);
      const squaredDistance = distance * distance;
      if (squaredDistance <= bestDistance) {
        bestDistance = squaredDistance;
        bestFlight = flight;
      }
    }

    return bestFlight;
  }
});

export async function bootPlayground() {
  if (map) {
    return;
  }

  els = collectElements();
  await loadRuntimeConfig();
  applyLayout();
  setupMap();
  setupEvents();
  renderCatalog();
  renderNetworkLog();
  renderInspector();

  try {
    await completeOAuthCallbackIfNeeded();
  } catch (error) {
    handleDataLoadError(error);
  }

  renderAuthState();

  if (getStoredTokenSet()) {
    await loadInitialData();
  }
}

async function loadRuntimeConfig() {
  if (window.IF_SAMPLE_CONFIG) {
    config = window.IF_SAMPLE_CONFIG;
    return;
  }

  try {
    const response = await fetch("/api/config", {
      headers: {
        Accept: "application/json"
      }
    });

    config = response.ok ? await response.json() : { configured: false };
  } catch {
    config = { configured: false };
  }
}

function setupMap() {
  map = L.map(els.map, {
    attributionControl: true,
    minZoom: 2,
    preferCanvas: true,
    worldCopyJump: true,
    zoomControl: false
  }).setView([35, 5], 3);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 12,
    subdomains: "abcd"
  }).addTo(map);

  layers = {
    flights: new AircraftCanvasLayer({
      onFlightClick: flight => {
        void selectFlight(flight);
      }
    }).addTo(map),
    route: L.layerGroup().addTo(map),
    geo: L.layerGroup().addTo(map),
    airports: L.layerGroup().addTo(map),
    atc: L.layerGroup().addTo(map),
    tracks: L.layerGroup().addTo(map)
  };
}

function setupEvents() {
  els.loginButton.addEventListener("click", () => void startLogin());
  els.logoutButton.addEventListener("click", logout);
  els.sessionSelect.addEventListener("change", () => void selectSessionById(els.sessionSelect.value));
  els.endpointSearch.addEventListener("input", () => renderCatalog());
  for (const button of els.layoutButtons) {
    button.addEventListener("click", () => toggleLayoutPane(button.dataset.layoutToggle));
  }
  els.layoutResetButton.addEventListener("click", resetLayout);
  for (const handle of els.resizeHandles) {
    handle.addEventListener("pointerdown", event => startPaneResize(event, handle));
    handle.addEventListener("keydown", event => resizePaneWithKeyboard(event, handle));
  }
  els.clearLogButton.addEventListener("click", event => {
    event.stopPropagation();
    clearNetworkLog();
  });
  els.drawerToggle.addEventListener("click", event => {
    event.stopPropagation();
    toggleDrawer();
  });
  els.drawerHead.addEventListener("dblclick", toggleDrawer);
  els.networkFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    state.requestFilter = button.dataset.filter;
    for (const filterButton of els.networkFilters.querySelectorAll("[data-filter]")) {
      filterButton.classList.toggle("active", filterButton === button);
    }
    renderNetworkLog();
  });

  for (const tab of els.inspectorTabs) {
    tab.addEventListener("click", () => {
      activateInspectorTab(tab.dataset.inspectorTab);
    });
  }
}

function activateInspectorTab(name) {
  state.inspectorTab = name;
  for (const item of els.inspectorTabs) {
    item.classList.toggle("active", item.dataset.inspectorTab === name);
  }
  renderInspector();
}

function loadLayout() {
  const saved = getStoredJson(LAYOUT_STORAGE_KEY);
  return {
    ...DEFAULT_LAYOUT,
    ...(saved || {})
  };
}

function saveLayout() {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout));
}

function applyLayout() {
  const layout = normalizeLayout(state.layout);
  state.layout = layout;

  document.documentElement.style.setProperty("--left-pane-width", `${layout.leftWidth}px`);
  document.documentElement.style.setProperty("--right-pane-width", `${layout.rightWidth}px`);
  document.documentElement.style.setProperty("--bottom-pane-height", `${layout.bottomHeight}px`);
  document.body.classList.toggle("hide-left", !layout.showLeft);
  document.body.classList.toggle("hide-right", !layout.showRight);
  document.body.classList.toggle("hide-bottom", !layout.showBottom);

  for (const button of els.layoutButtons) {
    const pane = button.dataset.layoutToggle;
    const visible = pane === "left"
      ? layout.showLeft
      : pane === "right"
        ? layout.showRight
        : layout.showBottom;
    button.classList.toggle("active", visible);
    button.setAttribute("aria-pressed", visible ? "true" : "false");
  }

  invalidateMapSoon();
}

function normalizeLayout(layout) {
  return {
    ...layout,
    leftWidth: clamp(Number(layout.leftWidth) || DEFAULT_LAYOUT.leftWidth, 190, 520),
    rightWidth: clamp(Number(layout.rightWidth) || DEFAULT_LAYOUT.rightWidth, 240, 620),
    bottomHeight: clamp(Number(layout.bottomHeight) || DEFAULT_LAYOUT.bottomHeight, 140, Math.max(220, Math.floor(window.innerHeight * 0.7))),
    showLeft: layout.showLeft !== false,
    showRight: layout.showRight !== false,
    showBottom: layout.showBottom !== false
  };
}

function toggleLayoutPane(pane) {
  if (pane === "left") {
    state.layout.showLeft = !state.layout.showLeft;
  } else if (pane === "right") {
    state.layout.showRight = !state.layout.showRight;
  } else if (pane === "bottom") {
    state.layout.showBottom = !state.layout.showBottom;
    if (state.layout.showBottom) {
      els.networkDrawer.classList.remove("collapsed");
    }
  }

  applyLayout();
  saveLayout();
}

function resetLayout() {
  state.layout = { ...DEFAULT_LAYOUT };
  els.networkDrawer.classList.remove("collapsed");
  applyLayout();
  saveLayout();
}

function startPaneResize(event, handle) {
  if (event.button !== 0) {
    return;
  }

  const pane = handle.dataset.resizePane;
  if (!pane) {
    return;
  }

  if (pane === "left") {
    state.layout.showLeft = true;
  } else if (pane === "right") {
    state.layout.showRight = true;
  } else if (pane === "bottom") {
    state.layout.showBottom = true;
    els.networkDrawer.classList.remove("collapsed");
  }

  handle.classList.add("active");
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing");
  document.body.classList.toggle("resizing-bottom", pane === "bottom");

  const move = moveEvent => {
    resizePaneToPointer(pane, moveEvent);
  };

  const stop = () => {
    handle.classList.remove("active");
    document.body.classList.remove("resizing", "resizing-bottom");
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
    saveLayout();
    invalidateMapSoon();
  };

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
  resizePaneToPointer(pane, event);
}

function resizePaneToPointer(pane, event) {
  const mainRect = document.querySelector(".main").getBoundingClientRect();
  if (pane === "left") {
    const max = Math.max(220, mainRect.width - (state.layout.showRight ? state.layout.rightWidth : 0) - 420);
    state.layout.leftWidth = clamp(event.clientX - mainRect.left, 190, Math.min(620, max));
  } else if (pane === "right") {
    const max = Math.max(260, mainRect.width - (state.layout.showLeft ? state.layout.leftWidth : 0) - 420);
    state.layout.rightWidth = clamp(mainRect.right - event.clientX, 240, Math.min(700, max));
  } else if (pane === "bottom") {
    state.layout.bottomHeight = clamp(window.innerHeight - event.clientY, 140, Math.max(220, Math.floor(window.innerHeight * 0.75)));
  }

  applyLayout();
}

function resizePaneWithKeyboard(event, handle) {
  const pane = handle.dataset.resizePane;
  const largeStep = event.shiftKey ? 40 : 12;
  let handled = true;

  if (pane === "left" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    state.layout.showLeft = true;
    state.layout.leftWidth += event.key === "ArrowLeft" ? -largeStep : largeStep;
  } else if (pane === "right" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    state.layout.showRight = true;
    state.layout.rightWidth += event.key === "ArrowLeft" ? largeStep : -largeStep;
  } else if (pane === "bottom" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    state.layout.showBottom = true;
    els.networkDrawer.classList.remove("collapsed");
    state.layout.bottomHeight += event.key === "ArrowUp" ? largeStep : -largeStep;
  } else {
    handled = false;
  }

  if (!handled) {
    return;
  }

  event.preventDefault();
  applyLayout();
  saveLayout();
}

async function loadInitialData() {
  try {
    await loadSessions({ autoSelect: true });
  } catch (error) {
    handleDataLoadError(error);
  }
}

async function startLogin() {
  if (!config.configured) {
    setApiStatus("Configure OAuth client env vars", "warn");
    return;
  }

  const stateToken = randomToken(32);
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify({
    state: stateToken,
    codeVerifier,
    createdAt: Date.now()
  }));

  const authorizeUrl = new URL(`${trimTrailingSlash(config.authBaseUrl)}/connect/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes);
  authorizeUrl.searchParams.set("state", stateToken);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  location.assign(authorizeUrl.href);
}

async function completeOAuthCallbackIfNeeded() {
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    localStorage.removeItem(OAUTH_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    history.replaceState(null, "", "/");
    throw createAppError("oauth_error", params.get("error_description") || `Sign in failed: ${error}`);
  }

  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code && !returnedState) {
    return;
  }

  const oauthState = getStoredOAuthState();
  localStorage.removeItem(OAUTH_STORAGE_KEY);

  if (!code || !returnedState || !oauthState || oauthState.state !== returnedState) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    history.replaceState(null, "", "/");
    throw createAppError("oauth_state", "Sign in failed: invalid OAuth state.");
  }

  setApiStatus("Completing sign in...", "warn");
  const tokenSet = await requestJson("/api/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      code,
      codeVerifier: oauthState.codeVerifier
    })
  });

  saveTokenSet(tokenSet);
  history.replaceState(null, "", "/");
}

function logout() {
  localStorage.removeItem(OAUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  resetDataState();
  renderAuthState();
  renderCatalog();
  renderNetworkLog();
  renderInspector();
}

function renderAuthState() {
  if (tokenTimer) {
    clearInterval(tokenTimer);
    tokenTimer = null;
  }

  if (!config.configured) {
    setApiStatus("OAuth env missing", "warn");
  }

  const tokenSet = getStoredTokenSet();
  if (!tokenSet) {
    els.loginButton.hidden = false;
    els.logoutButton.hidden = true;
    els.profileName.textContent = "Signed out";
    els.tokenExpiry.textContent = "token - unavailable";
    renderAvatar({ displayName: "IF" });
    resetSessionSelect("Sign in to load sessions");
    setMapSummary("Live", "Sign in to load aircraft");
    if (config.configured) {
      setApiStatus("Sign in required", "warn");
    }
    return;
  }

  els.loginButton.hidden = true;
  els.logoutButton.hidden = false;
  const profile = getProfile(tokenSet);
  els.profileName.textContent = profile.displayName;
  renderAvatar(profile);
  updateTokenCountdown();
  tokenTimer = setInterval(updateTokenCountdown, 1000);
  setApiStatus("API operational", "ok");
}

function resetDataState() {
  state.sessions = [];
  state.selectedSession = null;
  state.flights = [];
  state.selectedFlight = null;
  state.atc = [];
  state.airports = [];
  state.selectedAirport = null;
  state.aircraftCatalog = [];
  state.selectedAircraftPackage = null;
  state.tracks = [];
  state.selectedUserId = null;
  state.selectedLogbookFlight = null;
  state.userAtcSessions = [];
  state.selectedUserAtcSession = null;
  state.organizations = [];
  state.selectedOrganization = null;
  state.liveAircraft = [];
  state.selectedLiveAircraft = null;
  state.schedules = [];
  state.selectedSchedule = null;
  state.selectedEntity = null;
  if (layers) {
    Object.values(layers).forEach(layer => layer.clearLayers());
  }
}

async function loadSessions(options = {}) {
  setApiStatus("Loading sessions...", "warn");
  const payload = await requestV3Json("/v3/sessions", {
    label: "GET /v3/sessions",
    geo: true
  });
  const sessions = asArray(unwrapResult(payload));
  state.sessions = sessions;
  renderSessionOptions();
  renderCatalog();

  if (sessions.length === 0) {
    resetSessionSelect("No sessions returned");
    setMapSummary("Live", "No public sessions returned");
    setApiStatus("No sessions returned", "warn");
    return payload;
  }

  const preferredSession = findPreferredSession(sessions);
  if (options.autoSelect || !state.selectedSession) {
    await selectSession(preferredSession, { loadFlights: true });
  } else {
    setApiStatus(`Loaded ${sessions.length} sessions`, "ok");
  }

  return payload;
}

async function selectSessionById(id) {
  const session = findSessionById(state.sessions, id);
  if (session) {
    await selectSession(session, { loadFlights: true });
  }
}

async function selectSession(session, options = {}) {
  state.selectedSession = session;
  state.selectedFlight = null;
  state.selectedEntity = { type: "Session", value: session };
  saveSelectedSessionId(getEntityId(session));
  renderSessionOptions();
  renderCatalog();
  setMapSummary(`Live - ${getSessionName(session)}`, `${formatCount(getField(session, "userCount", "UserCount"), "pilot")} online`);
  if (options.loadFlights) {
    await loadFlights(getEntityId(session));
  }
}

async function loadFlights(id) {
  if (!id) {
    return null;
  }

  layers.geo.clearLayers();
  const payload = await requestV3Json(`/v3/sessions/${id}/flights`, {
    label: "GET /v3/sessions/{sessionId}/flights"
  });
  const flights = asArray(unwrapResult(payload));
  state.flights = flights;
  state.selectedFlight = flights[0] || null;
  state.selectedEntity = state.selectedFlight ? { type: "Flight", value: state.selectedFlight } : state.selectedEntity;
  renderFlightsOnMap(flights);
  renderCatalog();
  setMapSummary(`Live - ${getSessionName(state.selectedSession)}`, `${formatCount(flights.length, "aircraft")} airborne`);
  setApiStatus(`Loaded ${flights.length} flights`, "ok");
  return payload;
}

async function loadAtc(id) {
  const payload = await requestV3Json(`/v3/sessions/${id}/atc`, {
    label: "GET /v3/sessions/{sessionId}/atc",
    geo: true
  });
  state.atc = asArray(unwrapResult(payload));
  renderAtcOnMap(state.atc);
  return payload;
}

async function loadFlightRoute(id, selectedFlightId) {
  const payload = await requestV3Json(`/v3/sessions/${id}/flights/${selectedFlightId}/route`, {
    label: "GET /v3/sessions/{sessionId}/flights/{flightId}/route"
  });
  renderRouteOnMap(asArray(unwrapResult(payload)));
  return payload;
}

async function loadAirports() {
  const payload = await requestV3Json("/v3/airports", {
    label: "GET /v3/airports",
    geo: true
  });
  state.airports = asArray(unwrapResult(payload));
  state.selectedAirport = state.airports[0] || state.selectedAirport;
  state.selectedEntity = state.selectedAirport ? { type: "Airport", value: state.selectedAirport } : state.selectedEntity;
  renderAirportMarkers(state.airports);
  renderCatalog();
  return payload;
}

async function loadAircraftCatalog() {
  const payload = await requestV3Json("/v3/aircraft", {
    label: "GET /v3/aircraft"
  });
  state.aircraftCatalog = asArray(unwrapResult(payload));
  state.selectedAircraftPackage = state.aircraftCatalog[0] || state.selectedAircraftPackage;
  state.selectedEntity = state.selectedAircraftPackage ? { type: "Aircraft", value: state.selectedAircraftPackage } : state.selectedEntity;
  renderCatalog();
  return payload;
}

async function loadTracks() {
  const payload = await requestV3Json("/v3/tracks", {
    label: "GET /v3/tracks",
    geo: true
  });
  state.tracks = asArray(unwrapResult(payload));
  renderTrackMarkers(state.tracks);
  return payload;
}

async function loadUserFlights(userId) {
  const payload = await requestV3Json(`/v3/users/${userId}/flights?pageSize=25&page=1`, {
    label: "GET /v3/users/{userId}/flights"
  });
  const flights = getPaginatedData(unwrapResult(payload));
  state.selectedLogbookFlight = flights[0] || null;
  state.selectedEntity = state.selectedLogbookFlight ? { type: "Logbook Flight", value: state.selectedLogbookFlight } : state.selectedEntity;
  renderCatalog();
  return payload;
}

async function loadUserAtc(userId) {
  const payload = await requestV3Json(`/v3/users/${userId}/atc`, {
    label: "GET /v3/users/{userId}/atc"
  });
  const atcSessions = getPaginatedData(unwrapResult(payload));
  state.userAtcSessions = atcSessions;
  state.selectedUserAtcSession = atcSessions[0] || null;
  state.selectedEntity = state.selectedUserAtcSession ? { type: "User ATC", value: state.selectedUserAtcSession } : state.selectedEntity;
  renderCatalog();
  return payload;
}

async function loadOrganizations(selectFirst) {
  const payload = await requestV3Json("/v3/live/organizations", {
    label: "GET /v3/live/organizations"
  });
  state.organizations = asArray(unwrapResult(payload));
  if (selectFirst || !state.selectedOrganization) {
    state.selectedOrganization = state.organizations[0] || null;
  }
  state.selectedEntity = state.selectedOrganization ? { type: "Organization", value: state.selectedOrganization } : state.selectedEntity;
  renderCatalog();
  return payload;
}

async function loadLiveAircraft(id) {
  const payload = await requestV3Json(`/v3/live/organizations/${id}/aircraft`, {
    label: "GET /v3/live/organizations/{organizationId}/aircraft"
  });
  state.liveAircraft = asArray(unwrapResult(payload));
  state.selectedLiveAircraft = state.liveAircraft[0] || null;
  state.selectedEntity = state.selectedLiveAircraft ? { type: "Live Aircraft", value: state.selectedLiveAircraft } : state.selectedEntity;
  renderCatalog();
  return payload;
}

async function loadSchedules(id) {
  const payload = await requestV3Json(`/v3/live/aircraft/${id}/schedules`, {
    label: "GET /v3/live/aircraft/{aircraftId}/schedules"
  });
  state.schedules = asArray(unwrapResult(payload));
  state.selectedSchedule = state.schedules[0] || null;
  state.selectedEntity = state.selectedSchedule ? { type: "Schedule", value: state.selectedSchedule } : state.selectedEntity;
  renderCatalog();
  return payload;
}

function renderSessionOptions() {
  if (!state.sessions.length) {
    resetSessionSelect("No sessions returned");
    return;
  }

  const selectedId = normalizeId(getEntityId(state.selectedSession) || getEntityId(state.sessions[0]));
  els.sessionSelect.replaceChildren(...state.sessions.map(session => {
    const option = document.createElement("option");
    option.value = normalizeId(getEntityId(session));
    option.textContent = `${getSessionName(session)} - ${formatCount(getField(session, "userCount", "UserCount"), "pilot")}`;
    return option;
  }));
  els.sessionSelect.disabled = false;
  els.sessionSelect.value = selectedId || "";
}

function resetSessionSelect(label) {
  els.sessionSelect.disabled = true;
  els.sessionSelect.replaceChildren(new Option(label, ""));
}

function findPreferredSession(sessions) {
  const savedId = getSavedSelectedSessionId();
  return findSessionById(sessions, savedId) || sessions[0];
}

function findSessionById(sessions, id) {
  const normalizedId = normalizeId(id);
  if (!normalizedId) {
    return null;
  }

  return sessions.find(session => normalizeId(getEntityId(session)) === normalizedId) || null;
}

function getSavedSelectedSessionId() {
  return normalizeId(localStorage.getItem(SELECTED_SESSION_STORAGE_KEY));
}

function saveSelectedSessionId(id) {
  const normalizedId = normalizeId(id);
  if (normalizedId) {
    localStorage.setItem(SELECTED_SESSION_STORAGE_KEY, normalizedId);
  } else {
    localStorage.removeItem(SELECTED_SESSION_STORAGE_KEY);
  }
}

function renderCatalog() {
  const query = (els.endpointSearch.value || "").trim().toLowerCase();
  const signedIn = Boolean(getStoredTokenSet());
  let total = 0;
  const fragment = document.createDocumentFragment();

  for (const group of ENDPOINT_GROUPS) {
    const endpoints = group.endpoints.filter(definition => {
      const haystack = `${definition.method} ${definition.label} ${safePath(definition)}`.toLowerCase();
      return !query || haystack.includes(query);
    });

    if (endpoints.length === 0) {
      continue;
    }

    total += endpoints.length;
    const groupEl = document.createElement("section");
    groupEl.className = `group${state.collapsedGroups.has(group.name) ? " collapsed" : ""}`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "group-toggle";
    toggle.innerHTML = `<span class="chev">v</span><span class="group-name"></span><span class="group-count"></span>`;
    toggle.querySelector(".group-name").textContent = group.name;
    toggle.querySelector(".group-count").textContent = endpoints.length.toString();
    toggle.addEventListener("click", () => {
      if (state.collapsedGroups.has(group.name)) {
        state.collapsedGroups.delete(group.name);
      } else {
        state.collapsedGroups.add(group.name);
      }
      renderCatalog();
    });

    const list = document.createElement("div");
    list.className = "endpoints";

    for (const definition of endpoints) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "endpoint";
      const enabled = signedIn && canRunEndpoint(definition);
      button.disabled = !enabled;
      button.title = enabled ? `${definition.method} ${safePath(definition)}` : getDisabledReason(definition, signedIn);

      const method = document.createElement("span");
      method.className = `verb ${definition.method}`;
      method.textContent = definition.method;

      const path = document.createElement("span");
      path.className = "path";
      path.textContent = safePath(definition);

      button.append(method, path);
      if (definition.geo) {
        const geo = document.createElement("span");
        geo.className = "geo";
        geo.title = "Returns geo data";
        geo.textContent = "◉";
        button.append(geo);
      }

      button.addEventListener("click", () => void fireEndpoint(definition));
      list.append(button);
    }

    groupEl.append(toggle, list);
    fragment.append(groupEl);
  }

  els.catalog.replaceChildren(fragment);
  els.endpointCount.textContent = total.toString();
}

function canRunEndpoint(definition) {
  if (!definition.requires) {
    return true;
  }

  try {
    return Boolean(definition.requires());
  } catch {
    return false;
  }
}

function getDisabledReason(definition, signedIn) {
  if (!signedIn) {
    return "Sign in before calling PublicApi endpoints.";
  }

  if (!canRunEndpoint(definition)) {
    return "Load or select the required context first.";
  }

  return `${definition.method} ${safePath(definition)}`;
}

async function fireEndpoint(definition) {
  if (!getStoredTokenSet()) {
    setApiStatus("Sign in before calling PublicApi", "warn");
    return;
  }

  if (!canRunEndpoint(definition)) {
    setApiStatus("Load the required context first", "warn");
    return;
  }

  if (definition.confirmWrite && !confirm(`Send ${definition.method} ${safePath(definition)}?\n\nThis is a real PublicApi write request.`)) {
    return;
  }

  try {
    if (definition.run) {
      await definition.run();
      return;
    }

    await requestV3Json(definition.path(), {
      method: definition.method,
      body: definition.body ? definition.body() : undefined,
      geo: definition.geo,
      label: `${definition.method} ${safePath(definition)}`
    });
  } catch (error) {
    handleDataLoadError(error);
  }
}

async function requestV3Json(path, options = {}) {
  const accessToken = await getAccessToken();
  const method = options.method || "GET";
  const record = beginRequestRecord({
    method,
    path,
    label: options.label || `${method} ${path}`,
    body: options.body
  });

  try {
    const response = await fetch(`${trimTrailingSlash(config.publicApiBaseUrl)}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const payload = await readResponsePayload(response);
    completeRequestRecord(record, {
      status: response.status,
      statusText: response.statusText,
      payload
    });

    if (options.geo && response.ok) {
      plotGeoResults(payload);
    }

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        renderAuthState();
        renderCatalog();
        throw createAppError("token_expired", "Your sign-in is no longer valid. Sign in again.");
      }

      throw createAppError("public_api_request_failed", getApiErrorMessage(payload, response.status));
    }

    setApiStatus("API operational", "ok");
    return payload;
  } catch (error) {
    if (!record.finishedAt) {
      completeRequestRecord(record, {
        error: error?.message || "Request failed."
      });
    }

    setApiStatus("Request failed", "err");
    throw error;
  }
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, response.status));
  }

  return payload;
}

async function getAccessToken() {
  const tokenSet = getStoredTokenSet();
  if (!tokenSet) {
    throw createAppError("not_signed_in", "Sign in to continue.");
  }

  if (Date.now() < tokenSet.expiresAt - 60_000) {
    return tokenSet.access_token;
  }

  if (!tokenSet.refresh_token) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    renderAuthState();
    renderCatalog();
    throw createAppError("token_expired", "Your sign-in expired. Sign in again.");
  }

  return refreshAccessToken(tokenSet);
}

async function refreshAccessToken(tokenSet) {
  if (!refreshRequest) {
    setApiStatus("Refreshing token...", "warn");
    refreshRequest = requestJson("/api/oauth/refresh", {
      method: "POST",
      body: JSON.stringify({
        refreshToken: tokenSet.refresh_token
      })
    }).then(tokens => {
      const refreshed = saveTokenSet(tokens, tokenSet);
      renderAuthState();
      return refreshed.access_token;
    }).catch(error => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      renderAuthState();
      renderCatalog();
      throw createAppError("token_expired", error?.message
        ? `Your token could not be refreshed (${error.message}). Sign in again.`
        : "Your token could not be refreshed. Sign in again.");
    }).finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
}

function saveTokenSet(tokens, previousTokens = null) {
  if (!tokens?.access_token) {
    throw createAppError("token_missing", "The token response did not include an access token.");
  }

  const expiresAt = Date.now() + Number(tokens.expires_in || 1800) * 1000;
  const tokenSet = {
    ...previousTokens,
    ...tokens,
    refresh_token: tokens.refresh_token || previousTokens?.refresh_token || null,
    expiresAt,
    claims: {
      ...(previousTokens?.claims || {}),
      ...(decodeJwtPayload(tokens.access_token) || {}),
      ...(decodeJwtPayload(tokens.id_token) || {})
    }
  };

  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenSet));
  return tokenSet;
}

function beginRequestRecord({ method, path, label, body }) {
  const record = {
    id: ++requestSequence,
    method,
    path,
    label,
    body,
    startedAt: Date.now(),
    finishedAt: null,
    duration: null,
    status: null,
    statusText: "Pending",
    payload: null,
    error: null
  };

  state.requests.unshift(record);
  state.requests = state.requests.slice(0, 120);
  state.selectedRequestId = record.id;
  renderNetworkLog();
  renderInspector();
  return record;
}

function completeRequestRecord(record, { status = null, statusText = "", payload = null, error = null }) {
  record.finishedAt = Date.now();
  record.duration = record.finishedAt - record.startedAt;
  record.status = status;
  record.statusText = statusText || (error ? "Failed" : "Complete");
  record.payload = payload;
  record.error = error;
  state.selectedRequestId = record.id;
  renderNetworkLog();
  renderInspector();
}

function clearNetworkLog() {
  state.requests = [];
  state.selectedRequestId = null;
  renderNetworkLog();
  renderInspector();
}

function renderNetworkLog() {
  const rows = filteredRequests();
  const fragment = document.createDocumentFragment();

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = state.requests.length === 0 ? "No requests yet. Fire one from the catalog." : "No requests match this filter.";
    fragment.append(empty);
  } else {
    for (const record of rows) {
      fragment.append(requestRow(record));
    }
  }

  els.logRows.replaceChildren(fragment);
  const completed = state.requests.filter(item => item.duration != null);
  const avg = completed.length
    ? Math.round(completed.reduce((sum, item) => sum + item.duration, 0) / completed.length)
    : 0;
  els.networkStat.textContent = `${state.requests.length} request${state.requests.length === 1 ? "" : "s"} - avg ${avg} ms`;
}

function filteredRequests() {
  if (state.requestFilter === "all") {
    return state.requests;
  }

  if (state.requestFilter === "errors") {
    return state.requests.filter(item => item.error || (item.status != null && item.status >= 400));
  }

  return state.requests.filter(item => item.method === state.requestFilter);
}

function requestRow(record) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `log-row${record.id === state.selectedRequestId ? " selected" : ""}${record.finishedAt ? "" : " pending"}`;
  row.addEventListener("click", () => {
    state.selectedRequestId = record.id;
    renderNetworkLog();
    renderInspector();
  });

  const method = document.createElement("span");
  method.className = `verb ${record.method}`;
  method.textContent = record.method;

  const path = document.createElement("span");
  path.className = "path-cell";
  path.textContent = record.path;
  path.title = record.path;

  const status = document.createElement("span");
  status.className = `status-cell ${statusClass(record)}`;
  status.textContent = record.status == null ? "pending" : record.status.toString();

  const latency = document.createElement("span");
  latency.className = "latency-cell";
  latency.innerHTML = `<span class="lat-bar"><span class="lat-fill" style="width: ${record.finishedAt ? latencyWidth(record.duration) : 0}%"></span></span>`;

  const duration = document.createElement("span");
  duration.className = "lat-ms";
  duration.textContent = record.duration == null ? "" : `${record.duration}ms`;

  const time = document.createElement("span");
  time.className = "time-cell";
  time.textContent = formatClock(record.startedAt);

  row.append(method, path, status, latency, duration, time);
  return row;
}

function statusClass(record) {
  if (record.status == null && !record.error) {
    return "status-pending";
  }

  if (record.error || record.status >= 500) {
    return "status-err";
  }

  if (record.status >= 400) {
    return "status-warn";
  }

  return "status-ok";
}

function latencyWidth(duration) {
  if (!Number.isFinite(duration)) {
    return 0;
  }

  return Math.max(8, Math.min(100, Math.round((duration / 1500) * 100)));
}

function renderInspector() {
  const record = getSelectedRequest();
  if (!record && state.inspectorTab === "selected" && state.selectedEntity) {
    renderSelectedEntity();
    return;
  }

  if (!record) {
    renderInspectorEmpty();
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(renderRequestMeta(record));

  if (state.inspectorTab === "selected") {
    fragment.append(renderSelectedPayload(record));
  } else {
    const actions = document.createElement("div");
    actions.className = "meta-strip";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.textContent = "Copy JSON";
    copy.addEventListener("click", () => void copyRequestJson(record));
    actions.append(copy);
    fragment.append(actions);
    fragment.append(renderJsonTree(requestInspectorPayload(record)));
  }

  els.inspectorBody.replaceChildren(fragment);
}

function renderInspectorEmpty() {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.innerHTML = `<div class="empty-mark">+</div><p>Pick an endpoint on the left to fire a request and read the response here.</p>`;
  els.inspectorBody.replaceChildren(empty);
}

function renderRequestMeta(record) {
  const meta = document.createElement("div");
  meta.className = "meta-strip";

  const status = document.createElement("span");
  status.className = `status-badge ${statusClass(record).replace("status-", "")}`;
  status.textContent = record.status == null ? "pending" : record.status.toString();

  const method = document.createElement("span");
  method.className = `verb ${record.method}`;
  method.textContent = record.method;

  const path = document.createElement("span");
  path.className = "meta-path";
  path.textContent = record.path;
  path.title = record.path;

  const time = document.createElement("span");
  time.className = "meta-time";
  time.textContent = record.duration == null ? "pending" : `${record.duration} ms`;

  meta.append(status, method, path, time);
  return meta;
}

function requestInspectorPayload(record) {
  return {
    request: {
      method: record.method,
      path: record.path,
      startedAt: new Date(record.startedAt).toISOString(),
      duration: record.duration == null ? null : `${record.duration} ms`,
      body: record.body ?? null
    },
    response: {
      status: record.status,
      statusText: record.statusText,
      error: record.error,
      body: record.payload
    }
  };
}

function renderSelectedPayload(record) {
  const value = firstEntityFromPayload(record.payload);
  if (!value) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<p>No entity-style result is available for this response.</p>";
    return empty;
  }

  return selectedEntityView("Selected", value);
}

function renderSelectedEntity() {
  els.inspectorBody.replaceChildren(selectedEntityView(state.selectedEntity.type, state.selectedEntity.value));
}

function selectedEntityView(title, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "selected-view";

  const heading = document.createElement("h3");
  heading.className = "selected-title";
  heading.textContent = title;

  const rows = document.createElement("div");
  rows.className = "selected-table";
  for (const [key, rowValue] of flattenValue(value).slice(0, 80)) {
    const row = document.createElement("div");
    row.className = "selected-row";

    const keyEl = document.createElement("span");
    keyEl.className = "key";
    keyEl.textContent = key;

    const valueEl = document.createElement("span");
    valueEl.className = "value";
    valueEl.textContent = formatCellValue(rowValue);

    row.append(keyEl, valueEl);
    rows.append(row);
  }

  wrapper.append(heading, rows);
  return wrapper;
}

function renderJsonTree(value) {
  const container = document.createElement("div");
  container.className = "json-tree";
  container.append(jsonNode(value, null, 0));
  return container;
}

function jsonNode(value, key, depth) {
  const node = document.createElement("span");
  node.className = "json-node";

  const row = document.createElement("span");
  row.className = "json-row";
  row.style.paddingLeft = `${depth * 14}px`;

  if (key !== null) {
    const keyEl = document.createElement("span");
    keyEl.className = "json-key";
    keyEl.textContent = `"${key}"`;
    row.append(keyEl, document.createTextNode(": "));
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    const isArray = Array.isArray(value);
    const items = isArray ? value : Object.entries(value);
    const shouldCollapse = items.length > JSON_EAGER_CHILD_LIMIT || depth >= 4;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "json-toggle";
    toggle.textContent = isArray ? "[" : "{";

    const preview = document.createElement("span");
    preview.className = "json-preview";
    preview.textContent = isArray ? ` ${items.length} item${items.length === 1 ? "" : "s"} ]` : ` ${items.length} key${items.length === 1 ? "" : "s"} }`;

    const children = document.createElement("span");
    children.className = "json-children";
    let childrenRendered = false;

    const renderChildren = () => {
      if (childrenRendered) {
        return;
      }

      const renderedItems = items.slice(0, JSON_MAX_RENDERED_CHILDREN);
      for (const item of renderedItems) {
        if (isArray) {
          children.append(jsonNode(item, null, depth + 1));
        } else {
          children.append(jsonNode(item[1], item[0], depth + 1));
        }
      }

      if (items.length > renderedItems.length) {
        const omitted = document.createElement("span");
        omitted.className = "json-row json-omitted";
        omitted.style.paddingLeft = `${(depth + 1) * 14}px`;
        omitted.textContent = `... ${items.length - renderedItems.length} more ${isArray ? "items" : "keys"} omitted from preview. Use Copy JSON for the full response.`;
        children.append(omitted);
      }

      const close = document.createElement("span");
      close.className = "json-row";
      close.style.paddingLeft = `${depth * 14}px`;
      close.textContent = isArray ? "]" : "}";
      children.append(close);
      childrenRendered = true;
    };

    if (shouldCollapse) {
      node.classList.add("json-collapsed");
    } else {
      renderChildren();
    }

    toggle.addEventListener("click", () => {
      if (node.classList.contains("json-collapsed")) {
        renderChildren();
      }

      node.classList.toggle("json-collapsed");
    });

    row.append(toggle, preview);
    node.append(row, children);
    return node;
  }

  row.append(jsonScalar(value));
  node.append(row);
  return node;
}

function jsonScalar(value) {
  const span = document.createElement("span");
  if (value === null || value === undefined) {
    span.className = "json-null";
    span.textContent = "null";
  } else if (typeof value === "string") {
    span.className = "json-string";
    span.textContent = `"${value}"`;
  } else if (typeof value === "number") {
    span.className = "json-number";
    span.textContent = value.toString();
  } else if (typeof value === "boolean") {
    span.className = "json-bool";
    span.textContent = value.toString();
  } else {
    span.textContent = JSON.stringify(value);
  }

  return span;
}

async function copyRequestJson(record) {
  const text = JSON.stringify(requestInspectorPayload(record), null, 2);
  await navigator.clipboard?.writeText(text);
}

function getSelectedRequest() {
  return state.requests.find(item => item.id === state.selectedRequestId) || null;
}

function renderFlightsOnMap(flights) {
  const bounds = [];
  const selectedFlightId = flightId();

  for (const flight of flights) {
    const point = getLatLng(flight);
    if (!point) {
      continue;
    }

    bounds.push(point);
  }

  layers.flights.setFlights(flights, selectedFlightId);

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 6 });
  }
}

async function selectFlight(flight) {
  state.selectedFlight = flight;
  state.selectedUserId = getField(flight, "userId", "UserId") || state.selectedUserId;
  state.selectedEntity = { type: "Selected Aircraft", value: flight };
  state.selectedRequestId = null;
  layers.flights.setSelectedFlightId(getFlightId(flight));
  renderCatalog();
  activateInspectorTab("selected");

  const point = getLatLng(flight);
  if (point) {
    map.flyTo(point, Math.max(map.getZoom(), 6), { duration: 0.35 });
  }

  await loadSelectedFlightApis(flight);
}

async function loadSelectedFlightApis(flight) {
  const id = sessionId();
  const selectedFlightId = getFlightId(flight);
  if (!id || !selectedFlightId) {
    return;
  }

  const calls = [
    () => loadFlightRoute(id, selectedFlightId),
    () => requestV3Json(`/v3/sessions/${id}/flights/${selectedFlightId}/flightplan`, {
      label: "GET /v3/sessions/{sessionId}/flights/{flightId}/flightplan"
    }),
    () => requestV3Json(`/v3/sessions/${id}/flights/${selectedFlightId}`, {
      label: "GET /v3/sessions/{sessionId}/flights/{flightId}"
    })
  ];

  for (const call of calls) {
    try {
      await call();
    } catch (error) {
      handleDataLoadError(error);
    }
  }

  activateInspectorTab("selected");
}

function renderRouteOnMap(points) {
  layers.route.clearLayers();
  const latLngs = points.map(getLatLng).filter(Boolean);
  if (latLngs.length < 2) {
    return;
  }

  L.polyline(latLngs, {
    color: "#ff9142",
    opacity: 0.9,
    weight: 3
  }).addTo(layers.route);
  map.fitBounds(latLngs, { padding: [56, 56], maxZoom: 7 });
}

function renderAtcOnMap(facilities) {
  layers.atc.clearLayers();
  for (const facility of facilities) {
    const point = getLatLng(facility);
    if (!point) {
      continue;
    }

    L.circleMarker(point, {
      color: "#5db8ff",
      fillColor: "#5db8ff",
      fillOpacity: 0.35,
      radius: 7,
      weight: 2
    }).bindPopup(`<strong>${escapeHtml(getField(facility, "airportName", "AirportName", "name", "Name") || "ATC")}</strong>`).addTo(layers.atc);
  }
}

function renderAirportMarkers(airports) {
  layers.airports.clearLayers();
  const points = [];
  for (const airport of airports.slice(0, 600)) {
    const point = getLatLng(airport);
    if (!point) {
      continue;
    }

    points.push(point);
    L.circleMarker(point, {
      color: "#8493a6",
      fillColor: "#8493a6",
      fillOpacity: 0.2,
      radius: 4,
      weight: 1
    }).bindPopup(`<strong>${escapeHtml(getAirportIcao(airport) || "Airport")}</strong>`).addTo(layers.airports);
  }

  if (points.length > 0) {
    map.fitBounds(points, { padding: [56, 56], maxZoom: 5 });
  }
}

function renderTrackMarkers(tracks) {
  layers.tracks.clearLayers();
  plotGeoItems(tracks, layers.tracks, {
    color: "#c08bff",
    flyToBounds: true
  });
}

function plotGeoResults(payload) {
  layers.geo.clearLayers();
  const points = collectGeoItems(unwrapResult(payload));
  if (points.length === 0) {
    return;
  }

  plotGeoItems(points, layers.geo, {
    color: "#ff9142",
    flyToBounds: true
  });
}

function plotGeoItems(items, layer, options = {}) {
  const points = [];
  for (const item of items) {
    const point = getLatLng(item);
    if (!point) {
      continue;
    }

    points.push(point);
    L.circleMarker(point, {
      color: "#fff",
      fillColor: options.color || "#ff9142",
      fillOpacity: 0.86,
      radius: 7,
      weight: 2
    }).bindPopup(`<strong>${escapeHtml(getGeoLabel(item))}</strong>`).addTo(layer);
  }

  if (options.flyToBounds && points.length > 0) {
    map.flyToBounds(points, { duration: 0.55, padding: [56, 56], maxZoom: 7 });
  }
}

function collectGeoItems(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectGeoItems(item, output);
    }
    return output;
  }

  if (!isPlainObject(value)) {
    return output;
  }

  if (getLatLng(value)) {
    output.push(value);
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isPlainObject(child)) {
      collectGeoItems(child, output);
    }
  }

  return output;
}

function setMapSummary(title, count) {
  els.mapTitle.textContent = title;
  els.mapCount.textContent = count;
}

function toggleDrawer() {
  if (!state.layout.showBottom) {
    state.layout.showBottom = true;
    applyLayout();
    saveLayout();
    return;
  }

  els.networkDrawer.classList.toggle("collapsed");
  invalidateMapSoon();
}

function invalidateMapSoon() {
  if (!map) {
    return;
  }

  window.setTimeout(() => {
    map.invalidateSize({ animate: false });
  }, 0);
}

function setApiStatus(message, kind = "ok") {
  els.apiStatus.classList.toggle("warn", kind === "warn");
  els.apiStatus.classList.toggle("err", kind === "err");
  const dot = els.apiStatus.querySelector(".status-dot");
  els.apiStatus.replaceChildren(dot, document.createTextNode(message));
}

function handleDataLoadError(error) {
  if (error?.code === "not_signed_in" || error?.code === "token_expired") {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    renderAuthState();
    renderCatalog();
    setApiStatus(error.message || "Sign in again", "warn");
    return;
  }

  setApiStatus(error?.message || "Request failed", "err");
}

function updateTokenCountdown() {
  const tokenSet = getStoredTokenSet();
  if (!tokenSet) {
    els.tokenExpiry.textContent = "token - unavailable";
    return;
  }

  const remaining = Math.max(0, tokenSet.expiresAt - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  els.tokenExpiry.textContent = totalSeconds > 0
    ? `token - ${minutes}:${seconds.toString().padStart(2, "0")}`
    : "token - expired";
}

function renderAvatar(profile) {
  els.profileAvatar.replaceChildren();
  els.profileAvatar.classList.toggle("has-image", Boolean(profile.avatarUrl));

  if (profile.avatarUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = profile.avatarUrl;
    els.profileAvatar.append(image);
    return;
  }

  els.profileAvatar.textContent = getInitials(profile.displayName);
}

function getProfile(tokenSet) {
  const claims = tokenSet?.claims || {};
  const displayName = firstNonEmpty(
    claims.name,
    claims.username,
    claims.us,
    claims.preferred_username,
    claims.discourse_username,
    claims.sub,
    "Infinite Flight user"
  );

  return {
    userId: firstNonEmpty(claims.sub, claims.usi, claims.user_id, claims.userId),
    displayName,
    avatarUrl: firstNonEmpty(claims.picture, claims.avatar, claims.avatar_url, claims.avatarUrl)
  };
}

function getStoredTokenSet() {
  return getStoredJson(TOKEN_STORAGE_KEY);
}

function getStoredOAuthState() {
  const value = getStoredJson(OAUTH_STORAGE_KEY);
  if (!value || Date.now() - value.createdAt > 10 * 60 * 1000) {
    return null;
  }

  return value;
}

function getStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function createAppError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getApiErrorMessage(payload, status) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return payload?.error ||
    payload?.errorDescription ||
    payload?.error_description ||
    payload?.message ||
    payload?.result ||
    payload?.Result ||
    `Request failed: ${status}`;
}

function unwrapResult(payload) {
  return payload?.result ?? payload?.Result ?? payload;
}

function getPaginatedData(value) {
  return asArray(getField(value, "data", "Data", "items", "Items") ?? value);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
}

function getField(value, ...names) {
  if (!value) {
    return null;
  }

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(value, name)) {
      return value[name];
    }
  }

  return null;
}

function getEntityId(value) {
  return getField(value, "id", "Id", "ID", "sessionId", "SessionId");
}

function getFlightId(value) {
  return normalizeId(getField(value, "flightId", "FlightId", "id", "Id"));
}

function normalizeId(id) {
  return id == null || id === "" ? "" : String(id);
}

function sessionId() {
  return getEntityId(state.selectedSession) || getEntityId(state.sessions[0]);
}

function flightId() {
  return getFlightId(state.selectedFlight) || getFlightId(state.flights[0]);
}

function firstFlightIds() {
  return state.flights
    .map(getFlightId)
    .filter(Boolean)
    .slice(0, 10);
}

function currentUserId() {
  return state.selectedUserId ||
    getField(state.selectedFlight, "userId", "UserId") ||
    getProfile(getStoredTokenSet())?.userId;
}

function logbookFlightId() {
  return getField(state.selectedLogbookFlight, "id", "Id", "flightId", "FlightId");
}

function userAtcSessionId() {
  return getField(state.selectedUserAtcSession, "id", "Id", "atcSessionId", "AtcSessionId");
}

function aircraftPackageId() {
  return getField(state.selectedAircraftPackage, "id", "Id", "aircraftId", "AircraftId");
}

function airportIcao() {
  return getAirportIcao(state.selectedAirport) || "KSFO";
}

function organizationId() {
  return getField(state.selectedOrganization, "id", "Id") || getField(state.organizations[0], "id", "Id");
}

function liveAircraftId() {
  return getField(state.selectedLiveAircraft, "id", "Id") || getField(state.liveAircraft[0], "id", "Id");
}

function scheduleId() {
  return getField(state.selectedSchedule, "id", "Id") || getField(state.schedules[0], "id", "Id");
}

function createScheduleBody() {
  const now = new Date();
  const departure = new Date(now.getTime() + 60 * 60 * 1000);
  const arrival = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return {
    callsign: "IFD100",
    flightType: 0,
    originIcao: "KSFO",
    destinationIcao: "KLAX",
    scheduledDepartureUtc: departure.toISOString(),
    scheduledArrivalUtc: arrival.toISOString(),
    briefing: "Created from the OAuth API sample.",
    flightPlan: "DCT"
  };
}

function updateScheduleBody() {
  const selected = state.selectedSchedule || {};
  const now = new Date();
  const departure = new Date(now.getTime() + 90 * 60 * 1000);
  const arrival = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return {
    callsign: getField(selected, "callsign", "Callsign") || "IFD100",
    flightType: getField(selected, "flightType", "FlightType") ?? 0,
    originIcao: getField(selected, "originIcao", "OriginIcao") || "KSFO",
    destinationIcao: getField(selected, "destinationIcao", "DestinationIcao") || "KLAX",
    scheduledDepartureUtc: departure.toISOString(),
    scheduledArrivalUtc: arrival.toISOString(),
    briefing: getField(selected, "briefing", "Briefing") || "Updated from the OAuth API sample.",
    flightPlan: getField(selected, "flightPlan", "FlightPlan") || "DCT"
  };
}

function getSessionName(session) {
  return getField(session, "name", "Name") || shortId(getEntityId(session)) || "Session";
}

function getFlightTitle(flight) {
  return firstNonEmpty(
    getField(flight, "callsign", "Callsign"),
    getField(flight, "username", "Username"),
    getField(flight, "flightId", "FlightId"),
    "Flight"
  );
}

function getAircraftName(flight) {
  return firstNonEmpty(
    getField(flight, "aircraftDisplayName", "AircraftDisplayName"),
    getField(flight, "aircraftName", "AircraftName"),
    getField(flight, "aircraftId", "AircraftId"),
    "Aircraft"
  );
}

function getAirportIcao(airport) {
  return (firstNonEmpty(
    getField(airport, "icao", "Icao", "ICAO"),
    getField(airport, "airportIcao", "AirportIcao"),
    getField(airport, "name", "Name"),
    ""
  ) || "").toUpperCase();
}

function getGeoLabel(value) {
  return firstNonEmpty(
    getField(value, "callsign", "Callsign"),
    getField(value, "username", "Username"),
    getField(value, "airportName", "AirportName"),
    getField(value, "name", "Name"),
    getField(value, "icao", "Icao", "ICAO"),
    "Result"
  );
}

function getLatLng(value) {
  const lat = pickNumber(value, ["latitude", "Latitude", "lat", "Lat", "airportLatitude", "AirportLatitude"]);
  const lon = pickNumber(value, ["longitude", "Longitude", "lon", "Lon", "lng", "Lng", "airportLongitude", "AirportLongitude"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return [lat, lon];
}

function getHeading(value) {
  return pickNumber(value, ["heading", "Heading", "track", "Track"]) ?? 0;
}

function pickNumber(value, names) {
  const raw = getField(value, ...names);
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAltitude(flight) {
  const altitude = pickNumber(flight, ["altitude", "Altitude"]);
  return Number.isFinite(altitude) ? `${Math.round(altitude).toLocaleString()} ft` : "No altitude";
}

function formatCount(value, label) {
  const count = Number(value ?? 0);
  if (label === "aircraft") {
    return `${count.toLocaleString()} aircraft`;
  }

  return `${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`;
}

function formatCellValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function shortId(value) {
  if (!value) {
    return "";
  }

  const text = String(value);
  return text.length > 12 ? `${text.slice(0, 8)}...` : text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function flattenValue(value, prefix = "") {
  if (!isPlainObject(value)) {
    return [["value", value]];
  }

  const rows = [];
  for (const [key, rowValue] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(rowValue)) {
      rows.push(...flattenValue(rowValue, fullKey));
    } else {
      rows.push([fullKey, rowValue]);
    }
  }

  return rows;
}

function firstEntityFromPayload(payload) {
  const result = unwrapResult(payload);
  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (isPlainObject(result)) {
    const data = getField(result, "data", "Data", "items", "Items");
    if (Array.isArray(data)) {
      return data[0] || null;
    }

    return result;
  }

  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePath(definition) {
  try {
    return definition.path();
  } catch {
    return "Select required context";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getInitials(value) {
  const words = (value || "").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || "IF").toUpperCase();
}

function decodeJwtPayload(jwt) {
  const payload = jwt?.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
}

async function createCodeChallenge(codeVerifier) {
  const bytes = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function randomToken(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes) {
  let value = "";
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(Array.from(atob(padded), char => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
