import L from 'leaflet';

const app = document.getElementById('app');
app.innerHTML = `<div id="map" style="width:100vw;height:100vh;"></div>`;

const map = L.map('map').setView([-15.3875, 28.3228], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

L.marker([-15.3875, 28.3228])
  .addTo(map)
  .bindPopup('Yuvo GPS');

