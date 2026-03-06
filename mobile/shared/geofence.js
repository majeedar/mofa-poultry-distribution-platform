// Haversine distance calculation — exact logic from AGENT.md
export function checkGeofence(aeaLat, aeaLng, farmLat, farmLng) {
  const R    = 6371000;
  const dLat = (farmLat - aeaLat) * Math.PI / 180;
  const dLng = (farmLng - aeaLng) * Math.PI / 180;
  const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(aeaLat * Math.PI / 180) * Math.cos(farmLat * Math.PI / 180) *
               Math.sin(dLng/2) * Math.sin(dLng/2);
  const c    = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return {
    distance_m: Math.round(distance * 100) / 100,
    passed: distance <= 50,
  };
}

// GPS accuracy threshold — wait until accuracy < 20m before running check
export const GPS_ACCURACY_THRESHOLD = 20;
export const GEOFENCE_RADIUS_M = 50;
