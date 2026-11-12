// MapLibre for the playground map. Import it from here, not from
// "maplibre-gl", so the worker URL below is always set first.
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 finds its worker file next to its own module through
// import.meta.url. Vite bundles that module, so the default URL points at a
// file that does not exist. The `?url` import makes Vite serve the worker in
// dev and emit it as a hashed asset in the production build.
maplibregl.setWorkerUrl(workerUrl);

// Basemap: OpenFreeMap dark style, the same basemap as the Live website.
// It is free, needs no API key, has no request limits and allows commercial
// use; the style carries the attribution its terms ask for.
// Do not use CARTO basemaps (commercial license) or tile.openstreetmap.org
// (usage policy forbids apps like this one).
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

// OpenFreeMap serves glyphs only for the Noto Sans stacks. Any symbol layer
// with text must use this font (the MapLibre default is not on the server).
export const MAP_TEXT_FONT = ["Noto Sans Regular"];

export default maplibregl;
