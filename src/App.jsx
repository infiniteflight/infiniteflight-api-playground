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
        <label className="session-control" htmlFor="sessionSelect">
          <span>Session</span>
          <select id="sessionSelect" disabled>
            <option>Sign in to load sessions</option>
          </select>
        </label>
        <div className="layout-controls" id="layoutControls" aria-label="Workbench layout controls">
          <button className="layout-button" type="button" data-layout-toggle="left" title="Show or hide endpoint catalog" aria-label="Show or hide endpoint catalog">
            <span className="layout-icon left-pane" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-toggle="bottom" title="Show or hide network log" aria-label="Show or hide network log">
            <span className="layout-icon bottom-pane" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-toggle="right" title="Show or hide inspector" aria-label="Show or hide inspector">
            <span className="layout-icon right-pane" aria-hidden="true" />
          </button>
          <button className="layout-button" type="button" data-layout-reset title="Reset layout" aria-label="Reset layout">
            <span className="layout-icon reset-layout" aria-hidden="true" />
          </button>
        </div>
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

      <main className="main" id="workbench">
        <aside className="col left" id="leftPane">
          <div className="colhead">
            <div><span className="sub">Explore</span><h2>Endpoints</h2></div>
            <span className="count" id="endpointCount">0</span>
          </div>
          <div className="search">
            <input id="endpointSearch" type="search" placeholder="Search endpoints... e.g. flights, atc, user" />
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
              <div className="empty-mark">+</div>
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
          <button className="drawer-toggle" type="button" id="drawerToggle" aria-label="Toggle network log">v</button>
        </div>
        <div className="log" id="networkLog">
          <div className="log-grid-head">
            <span>Method</span><span>Path</span><span>Status</span><span>Latency</span><span /><span>Time</span>
          </div>
          <div id="logRows"><div className="log-empty">No requests yet. Fire one from the catalog.</div></div>
        </div>
      </section>
    </>
  );
}
