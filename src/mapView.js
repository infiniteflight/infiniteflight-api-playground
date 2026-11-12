import maplibregl, { MAP_STYLE_URL } from "./maplibre.js";

// The playground map: MapLibre with the OpenFreeMap basemap, aircraft as a
// symbol layer, and one GeoJSON source per overlay group (route line and
// circle markers). Callers give points as [lat, lon], the same order the rest
// of the playground uses; this module converts to MapLibre's [lon, lat].

const AIRCRAFT_SOURCE = "aircraft";
const AIRCRAFT_LAYER = "aircraft";
const AIRCRAFT_SELECTED_LAYER = "aircraft-selected";
const AIRCRAFT_IMAGE = "aircraft-normal";
const AIRCRAFT_SELECTED_IMAGE = "aircraft-selected";
const AIRCRAFT_CLICK_TOLERANCE = 12;
const MARKER_CLICK_TOLERANCE = 4;

// Draw order, bottom to top. Aircraft layers go above all of these.
const LINE_GROUPS = ["route"];
const CIRCLE_GROUPS = ["geo", "airports", "atc", "tracks"];
const ALL_GROUPS = [...LINE_GROUPS, ...CIRCLE_GROUPS];

const EMPTY_COLLECTION = Object.freeze({ type: "FeatureCollection", features: [] });

export function createMapView(container, options = {}) {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE_URL,
    center: [5, 35],
    zoom: 2,
    minZoom: 1,
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: true,
    attributionControl: { compact: true }
  });

  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.on("error", event => {
    console.warn("Map error", event?.error || event);
  });

  const state = {
    loaded: false,
    flights: [],
    selectedFlightId: null,
    groups: Object.fromEntries(ALL_GROUPS.map(group => [group, EMPTY_COLLECTION]))
  };
  let popup = null;
  let popupGroup = null;

  map.on("load", () => {
    addAircraftImages(map);

    for (const group of LINE_GROUPS) {
      map.addSource(group, { type: "geojson", data: state.groups[group] });
      map.addLayer({
        id: group,
        type: "line",
        source: group,
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": ["get", "opacity"],
          "line-width": ["get", "weight"]
        }
      });
    }

    for (const group of CIRCLE_GROUPS) {
      map.addSource(group, { type: "geojson", data: state.groups[group] });
      map.addLayer({
        id: group,
        type: "circle",
        source: group,
        paint: {
          "circle-color": ["get", "fillColor"],
          "circle-opacity": ["get", "fillOpacity"],
          "circle-radius": ["get", "radius"],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": ["get", "weight"]
        }
      });
    }

    map.addSource(AIRCRAFT_SOURCE, { type: "geojson", data: aircraftCollection() });
    const aircraftLayout = {
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map"
    };
    map.addLayer({
      id: AIRCRAFT_LAYER,
      type: "symbol",
      source: AIRCRAFT_SOURCE,
      filter: selectedFilter(false),
      layout: { ...aircraftLayout, "icon-image": AIRCRAFT_IMAGE }
    });
    map.addLayer({
      id: AIRCRAFT_SELECTED_LAYER,
      type: "symbol",
      source: AIRCRAFT_SOURCE,
      filter: selectedFilter(true),
      layout: { ...aircraftLayout, "icon-image": AIRCRAFT_SELECTED_IMAGE }
    });

    for (const layer of [AIRCRAFT_LAYER, AIRCRAFT_SELECTED_LAYER, ...CIRCLE_GROUPS]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    state.loaded = true;
  });

  map.on("click", event => {
    const flight = nearestFlight(event);
    if (flight) {
      options.onFlightClick?.(flight);
      return;
    }

    const marker = topMarkerAt(event.point);
    if (marker) {
      showPopup(marker);
    }
  });

  function selectedFilter(selected) {
    const match = ["==", ["get", "flightId"], state.selectedFlightId || ""];
    return selected ? match : ["!", match];
  }

  function aircraftCollection() {
    const features = [];
    state.flights.forEach((flight, index) => {
      const point = options.getLatLng?.(flight);
      if (!point) {
        return;
      }

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point[1], point[0]] },
        properties: {
          index,
          flightId: options.getFlightId?.(flight) || "",
          heading: Number(options.getHeading?.(flight)) || 0
        }
      });
    });

    return { type: "FeatureCollection", features };
  }

  function updateSource(id, data) {
    if (!state.loaded) {
      return;
    }

    map.getSource(id)?.setData(data);
  }

  function updateSelection() {
    if (!state.loaded) {
      return;
    }

    map.setFilter(AIRCRAFT_LAYER, selectedFilter(false));
    map.setFilter(AIRCRAFT_SELECTED_LAYER, selectedFilter(true));
  }

  function queryBox(point, tolerance, layers) {
    if (!state.loaded) {
      return [];
    }

    return map.queryRenderedFeatures([
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance]
    ], { layers });
  }

  function nearestFlight(event) {
    const features = queryBox(event.point, AIRCRAFT_CLICK_TOLERANCE, [AIRCRAFT_LAYER, AIRCRAFT_SELECTED_LAYER]);
    let bestFlight = null;
    let bestDistance = AIRCRAFT_CLICK_TOLERANCE * AIRCRAFT_CLICK_TOLERANCE;

    for (const feature of features) {
      const flight = state.flights[feature.properties?.index];
      const point = flight && options.getLatLng?.(flight);
      if (!point) {
        continue;
      }

      // Use the world copy nearest the click, so a click on a repeated world works.
      let lon = point[1];
      while (lon - event.lngLat.lng > 180) lon -= 360;
      while (lon - event.lngLat.lng < -180) lon += 360;

      const screenPoint = map.project([lon, point[0]]);
      const dx = screenPoint.x - event.point.x;
      const dy = screenPoint.y - event.point.y;
      const squaredDistance = (dx * dx) + (dy * dy);
      if (squaredDistance <= bestDistance) {
        bestDistance = squaredDistance;
        bestFlight = flight;
      }
    }

    return bestFlight;
  }

  function topMarkerAt(point) {
    // queryRenderedFeatures returns the top-most feature first.
    const [feature] = queryBox(point, MARKER_CLICK_TOLERANCE, CIRCLE_GROUPS);
    return feature || null;
  }

  function showPopup(feature) {
    popup?.remove();
    const content = document.createElement("strong");
    content.textContent = feature.properties?.label || "";
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(content)
      .addTo(map);
    popupGroup = feature.layer?.id || null;
  }

  function closePopupForGroup(group) {
    if (popup && popupGroup === group) {
      popup.remove();
      popup = null;
      popupGroup = null;
    }
  }

  return {
    map,

    setFlights(flights, selectedFlightId) {
      state.flights = Array.isArray(flights) ? flights : [];
      state.selectedFlightId = selectedFlightId || null;
      updateSource(AIRCRAFT_SOURCE, aircraftCollection());
      updateSelection();
    },

    setSelectedFlightId(selectedFlightId) {
      state.selectedFlightId = selectedFlightId || null;
      updateSelection();
    },

    // path: [[lat, lon], ...]. Longitudes may run past ±180 for routes that
    // cross the antimeridian; MapLibre draws them as one continuous line.
    setLine(group, path, style = {}) {
      const coordinates = path.map(point => [point[1], point[0]]);
      const data = coordinates.length < 2 ? EMPTY_COLLECTION : {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {
            color: style.color || "#ff9142",
            opacity: style.opacity ?? 1,
            weight: style.weight ?? 3
          }
        }]
      };
      state.groups[group] = data;
      updateSource(group, data);
    },

    // markers: [{ point: [lat, lon], label }]
    setCircles(group, markers, style = {}) {
      closePopupForGroup(group);
      const data = {
        type: "FeatureCollection",
        features: markers.map(marker => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [marker.point[1], marker.point[0]] },
          properties: {
            label: marker.label || "",
            color: style.color || "#ffffff",
            fillColor: style.fillColor || style.color || "#ff9142",
            fillOpacity: style.fillOpacity ?? 0.5,
            radius: style.radius ?? 6,
            weight: style.weight ?? 1
          }
        }))
      };
      state.groups[group] = data;
      updateSource(group, data);
    },

    clear(group) {
      state.groups[group] = EMPTY_COLLECTION;
      updateSource(group, EMPTY_COLLECTION);
      closePopupForGroup(group);
    },

    // points: [[lat, lon], ...]. duration is in seconds; 0 jumps.
    fitPoints(points, { padding = 48, maxZoom, duration } = {}) {
      if (!points.length) {
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) {
        bounds.extend([point[1], point[0]]);
      }

      map.fitBounds(bounds, {
        padding,
        maxZoom,
        ...(duration === undefined ? {} : { duration: duration * 1000 })
      });
    },

    flyTo(point, zoom, duration = 0.35) {
      map.flyTo({ center: [point[1], point[0]], zoom, duration: duration * 1000 });
    },

    getZoom() {
      return map.getZoom();
    },

    resize() {
      map.resize();
    }
  };
}

// Aircraft triangles, the same shape and colors as the old canvas layer:
// orange for normal aircraft, white with a glow for the selected one.
function addAircraftImages(map) {
  map.addImage(AIRCRAFT_IMAGE, drawAircraftImage("#ff9142", false), { pixelRatio: 2 });
  map.addImage(AIRCRAFT_SELECTED_IMAGE, drawAircraftImage("#ffffff", true), { pixelRatio: 2 });
}

function drawAircraftImage(color, glow) {
  const pixelRatio = 2;
  const half = 8 + (glow ? 10 : 2);
  const size = half * 2 * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.translate(half, half);
  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(6, 7);
  context.lineTo(0, 4);
  context.lineTo(-6, 7);
  context.closePath();
  context.fillStyle = color;

  if (glow) {
    context.shadowColor = "rgba(255, 255, 255, 0.75)";
    context.shadowBlur = 9 * pixelRatio;
  }

  context.fill();
  return context.getImageData(0, 0, size, size);
}
