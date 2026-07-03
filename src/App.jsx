import { AlertTriangle, Braces, ChevronDown, Crosshair, Github, ListTree, Map, PanelBottom, PanelLeft, PanelRight, RadioTower, RotateCcw, X } from "lucide-react";

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/infinite-flight-logo-horizontal.svg" alt="Infinite Flight" />
          <div className="brand-product">
            <strong>API Playground</strong>
          </div>
        </div>
        <div className="top-spacer" />
        <div className="status-pill" id="apiStatus"><span className="status-dot" />API operational</div>
        <div className="client-mode-group" id="clientModeGroup" aria-label="OAuth client type">
          <button className="client-mode-option" type="button" data-oauth-client="confidential">
            <span>OAuth</span>
            <strong>Confidential</strong>
          </button>
          <button className="client-mode-option" type="button" data-oauth-client="public">
            <span>OAuth</span>
            <strong>Public PKCE</strong>
          </button>
        </div>
        <label className="session-control" htmlFor="sessionSelect">
          <span>Session</span>
          <select id="sessionSelect" disabled>
            <option>Sign in to load sessions</option>
          </select>
        </label>
        <div className="layout-controls" id="layoutControls" aria-label="Workbench layout controls">
          <button className="layout-button" type="button" data-layout-toggle="left" title="Show or hide endpoint catalog" aria-label="Show or hide endpoint catalog">
            <PanelLeft className="layout-icon" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-toggle="bottom" title="Show or hide network log" aria-label="Show or hide network log">
            <PanelBottom className="layout-icon" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-toggle="right" title="Show or hide inspector" aria-label="Show or hide inspector">
            <PanelRight className="layout-icon" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-reset title="Reset layout" aria-label="Reset layout">
            <RotateCcw className="layout-icon" aria-hidden="true" />
          </button>
        </div>
        <a
          className="github-link"
          href="https://github.com/infiniteflight/infiniteflight-api-playground"
          target="_blank"
          rel="noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
        >
          <Github className="github-link-icon" aria-hidden="true" />
          <span>View on GitHub</span>
        </a>
        <div className="account-chip" id="accountChip">
          <div className="account-copy">
            <strong id="profileName">Signed out</strong>
            <span id="tokenExpiry">token - unavailable</span>
          </div>
          <div className="avatar" id="profileAvatar" aria-hidden="true">IF</div>
        </div>
        <button className="auth-button" type="button" id="loginButton">Sign in</button>
        <button className="auth-button secondary" type="button" id="logoutButton" hidden>Sign out</button>
      </header>

      <nav className="mobile-nav" id="mobileNav" aria-label="Playground views">
        <button className="mobile-tab active" type="button" data-mobile-pane="map" aria-pressed="true">
          <Map className="mobile-tab-icon" aria-hidden="true" />
          <span>Map</span>
        </button>
        <button className="mobile-tab" type="button" data-mobile-pane="endpoints" aria-pressed="false">
          <ListTree className="mobile-tab-icon" aria-hidden="true" />
          <span>Endpoints</span>
        </button>
        <button className="mobile-tab" type="button" data-mobile-pane="inspect" aria-pressed="false">
          <Braces className="mobile-tab-icon" aria-hidden="true" />
          <span>Inspect</span>
        </button>
        <button className="mobile-tab" type="button" data-mobile-pane="network" aria-pressed="false">
          <RadioTower className="mobile-tab-icon" aria-hidden="true" />
          <span>Network</span>
        </button>
      </nav>

      <main className="main" id="workbench">
        <aside className="col left" id="leftPane">
          <div className="colhead">
            <div><span className="sub">Explore</span><h2>Endpoints</h2></div>
            <span className="count" id="endpointCount">0</span>
          </div>
          <div className="search">
            <input id="endpointSearch" type="search" placeholder="Search endpoints... e.g. flights, atc, user" />
          </div>
          <div className="context-shell">
            <button className="context-toggle" type="button" id="contextToggleButton" aria-expanded="false" aria-controls="variablePanel">
              <span className="context-toggle-copy">
                <span className="sub">Context</span>
                <strong>Request variables</strong>
              </span>
              <span className="context-toggle-action">Edit</span>
            </button>
            <div className="context-summary" id="contextSummary" aria-label="Selected request variables" />

            <section className="variable-panel" id="variablePanel" aria-label="Endpoint variables" hidden>
              <div className="variable-panel-head">
                <div>
                  <span className="sub">Variables</span>
                  <strong>Choose request context</strong>
                </div>
                <button className="mini-button" type="button" id="contextCloseButton">Done</button>
              </div>

              <div className="variable-section">
                <h3>User and flight</h3>
                <div className="variable-group">
                  <div className="variable-row">
                    <label htmlFor="userSearchInput">User</label>
                    <button className="mini-button" type="button" id="useProfileUserButton">Me</button>
                  </div>
                  <input id="userSearchInput" type="search" placeholder="Search loaded pilots or paste user ID" />
                  <div className="variable-status" id="userVariableStatus">Signed-in user</div>
                  <div className="variable-results" id="userSearchResults" />
                </div>

                <div className="variable-grid">
                  <label className="variable-field">
                    <span>Flight</span>
                    <select id="flightVariableSelect" disabled>
                      <option>Load session flights</option>
                    </select>
                  </label>

                  <label className="variable-field">
                    <span>Airport</span>
                    <input id="airportIcaoInput" type="text" inputMode="text" maxLength={4} defaultValue="KSFO" />
                  </label>
                </div>
              </div>

              <div className="variable-section">
                <h3>Directory</h3>
                <div className="variable-group">
                  <div className="variable-row">
                    <label htmlFor="aircraftPackageSelect">Aircraft type</label>
                    <button className="mini-button" type="button" id="loadAircraftCatalogButton">Load</button>
                  </div>
                  <select id="aircraftPackageSelect" disabled>
                    <option>Load aircraft types</option>
                  </select>
                </div>
              </div>

              <div className="variable-section">
                <h3>Live</h3>
                <div className="variable-group">
                  <div className="variable-row">
                    <label htmlFor="organizationSelect">Organization</label>
                    <button className="mini-button" type="button" id="loadOrganizationsButton">Load</button>
                  </div>
                  <select id="organizationSelect" disabled>
                    <option>Load organizations</option>
                  </select>
                </div>

                <div className="variable-group">
                  <div className="variable-row">
                    <label htmlFor="liveAircraftSelect">Aircraft</label>
                    <button className="mini-button" type="button" id="loadLiveAircraftButton">Load</button>
                  </div>
                  <select id="liveAircraftSelect" disabled>
                    <option>Select organization first</option>
                  </select>
                </div>

                <div className="variable-group">
                  <div className="variable-row">
                    <label htmlFor="scheduleSelect">Schedule</label>
                    <button className="mini-button" type="button" id="loadSchedulesButton">Load</button>
                  </div>
                  <select id="scheduleSelect" disabled>
                    <option>Select live aircraft first</option>
                  </select>
                </div>
              </div>

              <details className="variable-more">
                <summary>Logbook and ATC</summary>
                <label className="variable-field">
                  <span>Logbook flight</span>
                  <select id="logbookFlightSelect" disabled>
                    <option>Run user flights first</option>
                  </select>
                </label>
                <label className="variable-field">
                  <span>User ATC session</span>
                  <select id="userAtcSessionSelect" disabled>
                    <option>Run user ATC first</option>
                  </select>
                </label>
              </details>
            </section>
          </div>
          <div className="catalog" id="catalog" />
        </aside>

        <div className="splitter left-splitter" data-resize-pane="left" role="separator" aria-orientation="vertical" aria-label="Resize endpoint catalog" tabIndex="0" />

        <section className="col center">
          <div id="map" aria-label="Live Infinite Flight map" />
          <div className="map-overlay">
            <span className="radar-dot" />
            <div><strong id="mapTitle">Live</strong> <span id="mapCount">Select a session</span></div>
          </div>
          <div className="map-legend">
            <div><span className="triangle-swatch" /> Active aircraft</div>
            <div className="legend-muted">Geo responses plot here</div>
          </div>
        </section>

        <div className="splitter right-splitter" data-resize-pane="right" role="separator" aria-orientation="vertical" aria-label="Resize inspector" tabIndex="0" />

        <aside className="col right" id="rightPane">
          <div className="colhead">
            <div><span className="sub">Inspect</span><h2>Response</h2></div>
          </div>
          <div className="tabs" role="tablist" aria-label="Inspector">
            <button className="tab active" type="button" data-inspector-tab="response">Response</button>
            <button className="tab" type="button" data-inspector-tab="selected">Selected</button>
          </div>
          <div className="inspector-body" id="inspectorBody">
            <div className="empty">
              <Crosshair className="empty-mark" aria-hidden="true" />
              <p>Pick an endpoint on the left to fire a request and read the response here.</p>
            </div>
          </div>
        </aside>
      </main>

      <section className="drawer" id="networkDrawer">
        <div className="drawer-resize" data-resize-pane="bottom" role="separator" aria-orientation="horizontal" aria-label="Resize network log" tabIndex="0" />
        <div className="drawer-head" id="drawerHead">
          <h2><span className="live-dot" />Network</h2>
          <div className="filters" id="networkFilters">
            <button className="chip active" type="button" data-filter="all">All</button>
            <button className="chip" type="button" data-filter="GET">GET</button>
            <button className="chip" type="button" data-filter="POST">POST</button>
            <button className="chip" type="button" data-filter="errors">Errors</button>
          </div>
          <span className="network-stat" id="networkStat">0 requests - avg 0 ms</span>
          <div className="top-spacer" />
          <button className="clear-button" type="button" id="clearLogButton">Clear</button>
          <button className="drawer-toggle" type="button" id="drawerToggle" aria-label="Toggle network log">
            <ChevronDown className="drawer-toggle-icon" aria-hidden="true" />
          </button>
        </div>
        <div className="log" id="networkLog">
          <div className="log-grid-head">
            <span>Method</span><span>Path</span><span>Status</span><span>Latency</span><span /><span>Time</span>
          </div>
          <div id="logRows"><div className="log-empty">No requests yet. Fire one from the catalog.</div></div>
        </div>
      </section>

      <div className="auth-error-backdrop" id="authErrorDialog" role="dialog" aria-modal="true" aria-labelledby="authErrorTitle" hidden>
        <div className="auth-error-card">
          <div className="auth-error-icon" aria-hidden="true">
            <AlertTriangle />
          </div>
          <button className="auth-error-close" type="button" id="authErrorCloseButton" aria-label="Close sign-in error">
            <X aria-hidden="true" />
          </button>
          <span className="auth-error-kicker">Sign-in failed</span>
          <h2 id="authErrorTitle">Unable to complete OAuth sign in</h2>
          <p id="authErrorDescription">
            The authorization server returned an error. Review the details below and try again.
          </p>
          <div className="auth-error-details">
            <div>
              <span>Error</span>
              <code id="authErrorCode">unknown_error</code>
            </div>
            <div id="authErrorUriRow" hidden>
              <span>Reference</span>
              <a id="authErrorUri" href="#" target="_blank" rel="noreferrer">Open documentation</a>
            </div>
          </div>
          <div className="auth-error-actions">
            <button className="auth-error-secondary" type="button" id="authErrorDismissButton">Dismiss</button>
            <button className="auth-error-primary" type="button" id="authErrorRetryButton">Try sign in again</button>
          </div>
        </div>
      </div>
    </>
  );
}
