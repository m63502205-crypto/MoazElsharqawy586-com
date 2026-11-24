import React, { useState, useEffect } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin } from 'lucide-react';

interface HeadquartersGoogleMapProps {
  coordinates?: string;
  address?: string;
  locationUrl?: string;
  fallbackEmbedUrl?: string;
  siteBrand?: string;
}

const DEFAULT_HQ_COORDS = { lat: 29.980836, lng: 30.840788 };

function parseLatLng(raw?: string): { lat: number; lng: number } {
  if (!raw) return DEFAULT_HQ_COORDS;
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (
    parts.length >= 2 &&
    Number.isFinite(parts[0]) &&
    Number.isFinite(parts[1]) &&
    Math.abs(parts[0]) <= 90 &&
    Math.abs(parts[1]) <= 180
  ) {
    return { lat: parts[0], lng: parts[1] };
  }
  return DEFAULT_HQ_COORDS;
}

const MapStatusWatcher: React.FC<{ onError: () => void }> = ({ onError }) => {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      if (status === APILoadingStatus.AUTH_FAILURE) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      onError();
    }
  }, [status, onError]);
  return null;
};

const HeadquartersMarkerWithInfo: React.FC<{
  position: { lat: number; lng: number };
  address: string;
  siteBrand: string;
  directionsHref: string;
}> = ({ position, address, siteBrand, directionsHref }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(true);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        onClick={() => setInfoOpen((prev) => !prev)}
        title={siteBrand}
      >
        <Pin background="#b91c1c" borderColor="#f59e0b" glyphColor="#ffffff" scale={1.15} />
      </AdvancedMarker>

      {infoOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)} maxWidth={280}>
          <div className="p-1 text-right font-sans space-y-1.5" dir="rtl">
            <div className="flex items-center gap-1.5 font-black text-red-800 text-xs">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{siteBrand}</span>
            </div>
            <p className="text-[11px] text-stone-700 leading-relaxed">{address}</p>
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:underline pt-1"
            >
              <span>الاتجاهات والمسار</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const HeadquartersGoogleMap: React.FC<HeadquartersGoogleMapProps> = ({
  coordinates,
  address,
  locationUrl,
  fallbackEmbedUrl,
  siteBrand = 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر'
}) => {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [sdkFailed, setSdkFailed] = useState(false);

  const position = parseLatLng(coordinates);
  const resolvedAddress =
    address || 'طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';
  const directionsHref =
    locationUrl ||
    `https://www.google.com/maps/dir/?api=1&destination=${position.lat},${position.lng}`;

  const defaultEmbedSrc =
    fallbackEmbedUrl ||
    'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed';

  if (!apiKey || sdkFailed) {
    return (
      <div className="w-full h-[360px] sm:h-[420px] bg-stone-100 relative">
        <iframe
          title="موقع أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر"
          src={defaultEmbedSrc}
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-[360px] sm:h-[420px] bg-stone-100 relative">
      <APIProvider apiKey={apiKey} language="ar" region="EG" libraries={['marker']}>
        <MapStatusWatcher onError={() => setSdkFailed(true)} />
        <GoogleMap
          defaultCenter={position}
          defaultZoom={16}
          mapId="DEMO_MAP_ID"
          gestureHandling="cooperative"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <HeadquartersMarkerWithInfo
            position={position}
            address={resolvedAddress}
            siteBrand={siteBrand}
            directionsHref={directionsHref}
          />
        </GoogleMap>
      </APIProvider>
    </div>
  );
};
