import 'ol/ol.css';
import Feature from 'ol/Feature';
import IGC from 'ol/format/IGC';
import Map from 'ol/Map';
import OSM, {ATTRIBUTION} from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import View from 'ol/View';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style';
import {LineString, Point} from 'ol/geom';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer';
import {getVectorContext} from 'ol/render';

const colors = {
  'Clement Latour': 'rgba(0, 0, 255, 0.7)',
  'Damien de Baesnt': 'rgba(0, 215, 255, 0.7)',
  'Sylvain Dhonneur': 'rgba(0, 165, 255, 0.7)',
  'Tom Payne': 'rgba(0, 255, 255, 0.7)',
  'Ulrich Prinz': 'rgba(0, 215, 255, 0.7)',
};

const styleCache = {};
const styleFunction = function (feature) {
  const color = colors[feature.get('PLT')];
  let style = styleCache[color];
  if (!style) {
    style = new Style({
      stroke: new Stroke({
        color: color,
        width: 3,
      }),
    });
    styleCache[color] = style;
  }
  return style;
};

const vectorSource = new VectorSource();

const igcUrls = [
  'data/igc/Clement-Latour.igc',
  'data/igc/Damien-de-Baenst.igc',
  'data/igc/Sylvain-Dhonneur.igc',
  'data/igc/Tom-Payne.igc',
  'data/igc/Ulrich-Prinz.igc',
];

function get(url, callback) {
  const client = new XMLHttpRequest();
  client.open('GET', url);
  client.onload = function () {
    callback(client.responseText);
  };
  client.send();
}

const igcFormat = new IGC();
for (let i = 0; i < igcUrls.length; ++i) {
  get(igcUrls[i], function (data) {
    const features = igcFormat.readFeatures(data, {
      featureProjection: 'EPSG:3857',
    });
    vectorSource.addFeatures(features);
  });
}

const time = {
  start: Infinity,
  stop: -Infinity,
  duration: 0,
};
vectorSource.on('addfeature', function (event) {
  const geometry = event.feature.getGeometry();
  time.start = Math.min(time.start, geometry.getFirstCoordinate()[2]);
  time.stop = Math.max(time.stop, geometry.getLastCoordinate()[2]);
  time.duration = time.stop - time.start;
});

const vectorLayer = new VectorLayer({
  source: vectorSource,
  style: styleFunction,
});

const map = new Map({
  layers: [
    new TileLayer({
      source: new OSM({
        attributions: [
          'All maps © <a href="https://www.opencyclemap.org/">OpenCycleMap</a>',
          ATTRIBUTION,
        ],
        url:
          'https://{a-c}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png' +
          '?apikey=Your API key from https://www.thunderforest.com/docs/apikeys/ here',
      }),
    }),
    vectorLayer,
  ],
  target: 'map',
  view: new View({
    center: [703365.7089403362, 5714629.865071137],
    zoom: 9,
  }),
});

let point = null;
let line = null;
const displaySnap = function (coordinate) {
  const closestFeature = vectorSource.getClosestFeatureToCoordinate(coordinate);
  const info = document.getElementById('info');
  if (closestFeature === null) {
    point = null;
    line = null;
    info.innerHTML = '&nbsp;';
  } else {
    const geometry = closestFeature.getGeometry();
    const closestPoint = geometry.getClosestPoint(coordinate);
    if (point === null) {
      point = new Point(closestPoint);
    } else {
      point.setCoordinates(closestPoint);
    }
    const date = new Date(closestPoint[2] * 1000);
    info.innerHTML =
      closestFeature.get('PLT') + ' (' + date.toUTCString() + ')';
    const coordinates = [coordinate, [closestPoint[0], closestPoint[1]]];
    if (line === null) {
      line = new LineString(coordinates);
    } else {
      line.setCoordinates(coordinates);
    }
  }
  map.render();
};

map.on('pointermove', function (evt) {
  if (evt.dragging) {
    return;
  }
  const coordinate = map.getEventCoordinate(evt.originalEvent);
  displaySnap(coordinate);
});

map.on('click', function (evt) {
  displaySnap(evt.coordinate);
});

const stroke = new Stroke({
  color: 'rgba(255,0,0,0.9)',
  width: 1,
});
const style = new Style({
  stroke: stroke,
  image: new CircleStyle({
    radius: 5,
    fill: null,
    stroke: stroke,
  }),
});
vectorLayer.on('postrender', function (evt) {
  const vectorContext = getVectorContext(evt);
  vectorContext.setStyle(style);
  if (point !== null) {
    vectorContext.drawGeometry(point);
  }
  if (line !== null) {
    vectorContext.drawGeometry(line);
  }
});

const featureOverlay = new VectorLayer({
  source: new VectorSource(),
  map: map,
  style: new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({
        color: 'rgba(255,0,0,0.9)',
      }),
    }),
  }),
});

const control = document.getElementById('time');
const listener = function () {
  const value = parseInt(control.value, 10) / 100;
  const m = time.start + time.duration * value;
  vectorSource.forEachFeature(function (feature) {
    const geometry =
      /** @type {import("../src/ol/geom/LineString.js").default} */ (
        feature.getGeometry()
      );
    const coordinate = geometry.getCoordinateAtM(m, true);
    let highlight = feature.get('highlight');
    if (highlight === undefined) {
      highlight = new Feature(new Point(coordinate));
      feature.set('highlight', highlight);
      featureOverlay.getSource().addFeature(highlight);
    } else {
      highlight.getGeometry().setCoordinates(coordinate);
    }
  });
  map.render();
};
control.addEventListener('input', listener);
control.addEventListener('change', listener);
