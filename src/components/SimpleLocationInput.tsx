import React, {useState} from 'react';
import {CheckCircle2, ExternalLink, Loader2, LocateFixed, MapPin, X} from 'lucide-react';
import {
  buildGoogleMapsSearchUrl,
  hasValidCoords,
  parseGoogleMapsCoords,
  type Coordinates,
} from '../lib/location';

interface SimpleLocationInputProps {
  lat: number | null;
  lng: number | null;
  onChange: (coords: Coordinates) => void;
  explanationText?: string;
  showMapsLinkField?: boolean;
  onLocationTextFill?: (fallbackHint: string) => void;
}

export const SimpleLocationInput: React.FC<SimpleLocationInputProps> = ({
  lat,
  lng,
  onChange,
  explanationText = 'CaterConnect uses your GPS location once to save your coordinates so nearby shifts and distances work accurately. We never track you in the background.',
  showMapsLinkField = true,
}) => {
  const [showExplain, setShowExplain] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapsLink, setMapsLink] = useState('');
  const [linkStatus, setLinkStatus] = useState<{type: 'ok' | 'warn'; text: string} | null>(null);
  const [gpsError, setGpsError] = useState('');

  const coordsSaved = hasValidCoords(lat, lng);

  const requestCurrentLocation = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setShowExplain(false);
      setGpsError('Location is unavailable in this browser. You can paste a Google Maps link or type your area.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setShowExplain(false);
        setLinkStatus(null);
        onChange({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setLocating(false);
        setShowExplain(false);
        setGpsError('Location permission denied. You can paste a Google Maps link or just type your area.');
      },
      {enableHighAccuracy: true, timeout: 10000}
    );
  };

  const handleMapsLinkChange = (value: string) => {
    setMapsLink(value);
    setGpsError('');
    if (!value.trim()) {
      setLinkStatus(null);
      return;
    }
    const parsed = parseGoogleMapsCoords(value);
    if (parsed) {
      onChange(parsed);
      setLinkStatus({type: 'ok', text: 'Coordinates extracted from Google Maps link.'});
    } else if (value.trim().length > 8) {
      setLinkStatus({
        type: 'warn',
        text: 'Could not find coordinates in that link yet. Use a full Google Maps URL containing @lat,lng or ?q=lat,lng.',
      });
    } else {
      setLinkStatus(null);
    }
  };

  const checkUrl = coordsSaved ? buildGoogleMapsSearchUrl(lat, lng) : '';

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setGpsError('');
            setShowExplain(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-full bg-[#4B6F1B]/12 hover:bg-[#4B6F1B]/20 text-[#3C5A15] text-xs font-semibold cursor-pointer transition-colors"
        >
          <LocateFixed className="w-3.5 h-3.5 text-[#4B6F1B]" />
          <span>Use my current location</span>
        </button>

        {coordsSaved && (
          <button
            type="button"
            onClick={() => {
              onChange({lat: null, lng: null});
              setMapsLink('');
              setLinkStatus(null);
            }}
            className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-full bg-[#F3F4F6] text-[#6B7280] text-[11px] font-medium hover:text-[#111827] cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>Clear coordinates</span>
          </button>
        )}
      </div>

      {showExplain && (
        <div className="p-3.5 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 space-y-2.5">
          <p className="text-xs text-[#111827] leading-relaxed">{explanationText}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={requestCurrentLocation}
              disabled={locating}
              className="px-4 py-2 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
              <span>{locating ? 'Getting location...' : 'Allow Location'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowExplain(false)}
              className="px-3.5 py-2 rounded-full bg-white text-[#6B7280] text-xs font-medium border border-gray-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMapsLinkField && (
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-[#111827] mb-1">
            Paste Google Maps link (optional)
          </label>
          <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[44px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={mapsLink}
              onChange={(e) => handleMapsLinkChange(e.target.value)}
              placeholder="Paste Google Maps link or lat, lng"
              className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
          {linkStatus && (
            <p
              className={`text-[11px] mt-1 pl-2 flex items-start gap-1 ${
                linkStatus.type === 'ok' ? 'text-[#3C5A15] font-medium' : 'text-[#B45309]'
              }`}
            >
              {linkStatus.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span>{linkStatus.text}</span>
            </p>
          )}
        </div>
      )}

      {gpsError && <p className="text-xs text-[#B45309] pl-1">{gpsError}</p>}

      {coordsSaved && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F3F4F6]/80 text-[11px] text-[#6B7280] min-w-0">
          <span className="tabular-nums break-words">
            Saved coordinates: {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
          </span>
          <a
            href={checkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#4B6F1B] font-semibold hover:underline shrink-0"
          >
            <span>Check on Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
