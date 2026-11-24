export interface Coordinates {
  lat: number | null;
  lng: number | null;
}

export function hasValidCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function buildGoogleMapsSearchUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  locationName?: string
): string {
  if (hasValidCoords(lat, lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName || '')}`;
}

export function buildGoogleMapsDirectionsUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  locationName?: string
): string {
  if (hasValidCoords(lat, lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationName || '')}`;
}

export function parseGoogleMapsCoords(rawInput: string): {lat: number; lng: number} | null {
  const input = rawInput.trim();
  if (!input) return null;

  const patterns: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center|sll)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /\/search\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*$/,
    /(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/,
  ];

  for (const re of patterns) {
    const m = input.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (hasValidCoords(lat, lng)) {
        return {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        };
      }
    }
  }
  return null;
}
