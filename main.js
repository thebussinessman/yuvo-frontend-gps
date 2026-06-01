import L from 'leaflet';

const app = document.getElementById('app');

app.innerHTML = `
  <div id="root">
    <div id="sidebar">
      <h2>Yuvo GPS</h2>
      <p>Fleet Dashboard</p>

      <ul>
        <li>Dashboard</li>
        <li>Vehicles</li>
        <li>Replay</li>
        <li>Geofences</li>
        <li>Reports</li>
      </ul>
    </div>

    <div id="map"></div>
  </div>
`;

/* 🔧 GLOBAL + LAYOUT STYLES (CRITICAL) */
const style = document.createElement('style');
style.innerHTML = `
  html, body {
    height: 100%;
    margin: 0;
  }

  #app {
    height: 100%;
  }

  #root {
    display: flex;
    height: 100%;
    width: 100%;
  }

  #sidebar {
    width: 280px;
    min-width: 280px;
    background: #0f172a;
    color: white;
    padding: 16px;
    box-sizing: border-box;
    font-family: system-ui, sans-serif;
  }

  #sidebar h2 {
    margin-top: 0;
  }

  #sidebar ul {
    list-style: none;
    padding: 0;
  }

  #sidebar li {
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    cursor: pointer;
  }

  #map {
    flex: 1;
    height: 100%;
  }
`;
document.head.appendChild(style);

/* 🗺️ LEAFLET MAP INIT */
const map = L.map('map').setView([-15.3875, 28.3228], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

L.marker([-15.3875, 28.3228])
  .addTo(map)
  .bindPopup('Vehicle A001');

const { ValidationPipe } = require('@nestjs/common');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // add this line alongside your existing setup
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(3000);
}
bootstrap();