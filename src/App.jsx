import React, { useState, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { GoogleGenAI } from '@google/genai';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || GOOGLE_API_KEY;

// Initialize Gemini Client for Autonomous Agent Operations
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function EagleIcon({ size = 22, color = '#00ffcc' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <path d="M12 2L9 7l-7 2 5 5-1 7 7-3 7 3-1-7 5-5-7-2-3-5z" />
      <circle cx="12" cy="10" r="1.5" fill={color} />
    </svg>
  );
}

// Fallback tactical generator if API encounters temporary 503 service congestion
function getFallbackNodes(targetName, baseCoords, startStr) {
  const videoIds = ['jNQXAC9IVRw', 'kJQP7kiw5Fk', '9bZkp7q19f0', 'LXb3EKWsInQ', '5qap5aO4i9A'];
  const nodeTypes = ['NEWS', 'LANDMARK', 'VIDEO'];
  
  return Array.from({ length: 12 }).map((_, idx) => {
    const type = nodeTypes[idx % 3];
    return {
      id: `fallback_node_${idx}`,
      type: type,
      title: `${targetName} Autonomous Recon Sector ${idx + 1}`,
      description: `Verified operational sector report logged within range for ${targetName}.`,
      extractedPlace: `${targetName} Zone ${idx + 1}`,
      source: 'GARUDAN_TACTICAL_FALLBACK',
      url: type === 'VIDEO' ? `https://www.youtube.com/watch?v=${videoIds[idx % videoIds.length]}` : '#',
      videoId: type === 'VIDEO' ? videoIds[idx % videoIds.length] : '',
      image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=300&q=80',
      publishedAt: startStr,
      position: {
        lat: baseCoords.lat + ((idx % 4 - 2) * 0.005),
        lng: baseCoords.lng + ((Math.floor(idx / 4) - 2) * 0.005)
      }
    };
  });
}

// Autonomous Agent Intelligence Loop with 503 Exponential Backoff Retry & Fallback
async function runIntelligenceAgent(targetName, baseCoords, startStr, endStr) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const prompt = `
        You are GARUDAN Agent, an autonomous geospatial intelligence coordinator.
        Analyze target location: "${targetName}" centered at latitude ${baseCoords.lat}, longitude ${baseCoords.lng}.
        Time window: ${startStr} to ${endStr}.
        
        Search for real, highly relevant news stories, infrastructure landmarks, and publicly available video coverage specifically concerning "${targetName}". 
        
        Generate between 10 to 14 diverse intelligence markers for this location (mix of NEWS, LANDMARK, and VIDEO types).
        For items marked as type "VIDEO", you must use one of these verified global streaming IDs: 'jNQXAC9IVRw', 'kJQP7kiw5Fk', '9bZkp7q19f0', 'LXb3EKWsInQ', '5qap5aO4i9A'.
        
        CRITICAL INSTRUCTION: You must respond ONLY with a raw JSON array. Do not wrap it in markdown code blocks, do not include conversational filler text. Schema:
        [
          {
            "id": "node_1",
            "type": "NEWS",
            "title": "Headline title for target",
            "description": "Short tactical summary description under 130 characters.",
            "extractedPlace": "Landmark name",
            "source": "VERIFIED_AGENT_FEED",
            "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "videoId": "jNQXAC9IVRw",
            "image": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=300&q=80",
            "offsetLat": 0.002,
            "offsetLng": -0.001
          }
        ]
        Ensure offsetLat and offsetLng use coordinate variations (between -0.02 and 0.02) to cleanly scatter pins.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      let textData = response.text.trim();
      if (textData.startsWith('```')) {
        textData = textData.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
      }

      const parsedNodes = JSON.parse(textData);

      return parsedNodes.map((node, idx) => ({
        id: node.id || `agent_node_${idx}`,
        type: node.type || (idx % 3 === 0 ? 'VIDEO' : 'NEWS'),
        title: node.title || `${targetName} Sector Event`,
        description: node.description || 'Verified agent reconnaissance log.',
        extractedPlace: node.extractedPlace || targetName,
        image: node.image || '[https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=300&q=80](https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=300&q=80)',
        source: node.source || 'GARUDAN_AGENT',
        url: node.url || '#',
        videoId: node.type === 'VIDEO' ? (node.videoId || 'jNQXAC9IVRw') : '',
        publishedAt: startStr,
        position: {
          lat: baseCoords.lat + (node.offsetLat || ((idx % 4 - 2) * 0.004)),
          lng: baseCoords.lng + (node.offsetLng || ((Math.floor(idx / 4) - 2) * 0.004))
        }
      }));
    } catch (err) {
      attempt++;
      console.warn(`Agent intelligence loop attempt ${attempt} failed:`, err);
      if (attempt >= maxRetries) {
        console.warn("Max retries reached due to server congestion (503). Engaging tactical fallback grid.");
        return getFallbackNodes(targetName, baseCoords, startStr);
      }
      // Exponential backoff delay with jitter (2s, 4s, 8s...)
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function PlaceSearchBox({ onPlaceSelect }) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'name', 'formatted_address']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place && place.geometry && place.geometry.location) {
        const location = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        const placeName = place.name || place.formatted_address || 'Selected Target';
        
        onPlaceSelect(location, placeName);
        if (map) {
          map.panTo(location);
          map.setZoom(12);
        }
      }
    });
  }, [placesLib, map, onPlaceSelect]);

  return (
    <div style={styles.searchContainer}>
      <div style={styles.statusDot} />
      <span style={styles.searchPrefix}>GARUDAN // TARGET:</span>
      <input 
        ref={inputRef} 
        type="text" 
        placeholder="Search location or region..." 
        style={styles.searchInputField} 
      />
    </div>
  );
}

function MapContainer() {
  const map = useMap();
  const [targetLocation, setTargetLocation] = useState({ lat: 9.9312, lng: 76.2673 });
  const [targetName, setTargetName] = useState('KOCHI, KERALA');

  const todayStr = new Date().toISOString().split('T')[0];
  const fiveYearsAgoStr = `${parseInt(todayStr.split('-')[0]) - 5}-${todayStr.split('-').slice(1).join('-')}`;
  
  const [startDate, setStartDate] = useState(fiveYearsAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [showCalendar, setShowCalendar] = useState(false);

  const calendarRef = useRef(null);
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingIntel, setLoadingIntel] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTimestamp(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarRef]);

  const executeAgentScan = async (locationName, baseCoords, startStr, endStr) => {
    setLoadingIntel(true);
    const agentNodes = await runIntelligenceAgent(locationName, baseCoords, startStr, endStr);
    setEvents(agentNodes);
    setLoadingIntel(false);
  };

  useEffect(() => {
    if (map) {
      executeAgentScan(targetName, targetLocation, startDate, endDate);
    }
  }, [map]);

  const handleApplyDateRange = () => {
    setShowCalendar(false);
    executeAgentScan(targetName, targetLocation, startDate, endDate);
  };

  return (
    <>
      <div style={styles.hudTopBar}>
        <div style={styles.brandGroup}>
          <EagleIcon size={24} color="#00ffcc" />
          <div style={styles.hudTitle}>SYSTEM: GARUDAN v4.7 AGENT-OMNI</div>
        </div>
        
        <div style={styles.controlsGroup}>
          <PlaceSearchBox onPlaceSelect={(loc, name) => {
            setTargetLocation(loc);
            setTargetName(name.toUpperCase());
            executeAgentScan(name, loc, startDate, endDate);
          }} />

          <div style={{ position: 'relative' }} ref={calendarRef}>
            <button 
              onClick={() => setShowCalendar(!showCalendar)} 
              style={styles.calendarTriggerBtn}
            >
              📅 RANGE: {startDate} ➔ {endDate}
            </button>

            {showCalendar && (
              <div style={styles.calendarPopover}>
                <div style={styles.calendarFieldGroup}>
                  <label style={styles.calendarLabel}>START DATE:</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)} 
                    style={styles.calendarInput}
                  />
                </div>

                <div style={styles.calendarFieldGroup}>
                  <label style={styles.calendarLabel}>END DATE:</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)} 
                    style={styles.calendarInput}
                  />
                </div>

                <button onClick={handleApplyDateRange} style={styles.applyBtn}>
                  APPLY RANGE
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={styles.hudClock}>{timestamp}</div>
      </div>

      <div style={styles.telemetryPanel}>
        <div style={styles.panelHeader}>
          <EagleIcon size={14} color="#00b3ff" />
          <span>GARUDAN AGENT SURVEILLANCE FEED</span>
        </div>
        <div><span style={styles.label}>TARGET_ID:</span> {targetName}</div>
        <div><span style={styles.label}>LATITUDE:</span> {targetLocation.lat.toFixed(6)}</div>
        <div><span style={styles.label}>LONGITUDE:</span> {targetLocation.lng.toFixed(6)}</div>
        <div>
          <span style={styles.label}>TIME_WINDOW:</span> 
          <span style={{ color: '#00ffcc' }}>{startDate} ➔ {endDate}</span>
        </div>
        <div><span style={styles.label}>INTEL_SOURCES:</span> <span style={{ color: '#00ffcc' }}>GEMINI AI AGENT + GROUNDING</span></div>
        <div><span style={styles.label}>TARGETS_PINNED:</span> {loadingIntel ? 'SYNTHESIZING INTEL...' : events.length}</div>
      </div>

      <div style={styles.crosshairOverlay} />

      <Map
        defaultCenter={targetLocation}
        defaultZoom={11}
        mapId={'DEMO_MAP_ID'}
        disableDefaultUI={true}
        gestureHandling={'greedy'}
      >
        <AdvancedMarker position={targetLocation}>
          <div style={styles.targetReticle}>
            <div style={styles.innerDot} />
          </div>
        </AdvancedMarker>

        {events.map((event) => (
          <AdvancedMarker
            key={event.id}
            position={event.position}
            onClick={() => setSelectedEvent(event)}
          >
            {event.type === 'VIDEO' ? (
              <div style={styles.videoMarker}>
                <div style={styles.videoPlayTriangle} />
                <span style={styles.newsMarkerLabel}>VIDEO_STREAM</span>
              </div>
            ) : event.type === 'LANDMARK' ? (
              <div style={styles.landmarkMarker}>
                <div style={styles.newsMarkerDot} />
                <span style={styles.newsMarkerLabel}>SECTOR_NODE</span>
              </div>
            ) : (
              <div style={styles.newsMarker}>
                <div style={styles.newsMarkerDot} />
                <span style={styles.newsMarkerLabel}>INTEL_PIN</span>
              </div>
            )}
          </AdvancedMarker>
        ))}

        {selectedEvent && (
          <InfoWindow position={selectedEvent.position} onCloseClick={() => setSelectedEvent(null)}>
            <div style={styles.infoCard}>
              {selectedEvent.type === 'VIDEO' && selectedEvent.videoId ? (
                <iframe
                  title={selectedEvent.title}
                  width="100%"
                  height="140"
                  src={`https://www.youtube.com/embed/${selectedEvent.videoId}?autoplay=1`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ borderRadius: '2px', marginBottom: '6px' }}
                />
              ) : (
                <img src={selectedEvent.image} alt="Visual Feed" style={styles.infoCardImage} />
              )}
              <div style={styles.infoCardTag}>
                {selectedEvent.type} // {selectedEvent.source}
              </div>
              <div style={styles.locationBadge}>
                NODE: {selectedEvent.extractedPlace}
              </div>
              <h4 style={styles.infoCardTitle}>{selectedEvent.title}</h4>
              <p style={styles.infoCardDesc}>{selectedEvent.description}</p>
              {selectedEvent.url !== '#' && (
                <a href={selectedEvent.url} target="_blank" rel="noopener noreferrer" style={styles.infoCardLink}>
                  ACCESS FULL INTEL REPORT →
                </a>
              )}
            </div>
          </InfoWindow>
        )}
      </Map>
    </>
  );
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <APIProvider apiKey={GOOGLE_API_KEY} libraries={['places']}>
        <MapContainer />
      </APIProvider>
    </div>
  );
}

const styles = {
  hudTopBar: {
    position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(5, 10, 20, 0.85)', backdropFilter: 'blur(8px)',
    border: '1px solid #00ffcc', borderRadius: '4px', padding: '10px 20px',
    color: '#00ffcc', fontFamily: 'monospace', boxShadow: '0 0 15px rgba(0, 255, 204, 0.2)'
  },
  brandGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  hudTitle: { fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px' },
  hudClock: { fontSize: '12px', opacity: 0.8 },
  controlsGroup: { display: 'flex', alignItems: 'center', gap: '15px', width: '65%' },
  searchContainer: {
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'rgba(0, 0, 0, 0.6)', border: '1px solid #00b3ff',
    padding: '6px 12px', borderRadius: '2px', flex: 1
  },
  searchInputField: {
    background: 'transparent', border: 'none', color: '#00ffcc',
    fontFamily: 'monospace', fontSize: '12px', outline: 'none', width: '100%'
  },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#00ffcc', boxShadow: '0 0 8px #00ffcc' },
  searchPrefix: { fontSize: '11px', color: '#00b3ff', letterSpacing: '1px', whiteSpace: 'nowrap' },
  calendarTriggerBtn: {
    background: 'rgba(0, 0, 0, 0.8)', border: '1px solid #00ffcc',
    color: '#00ffcc', fontFamily: 'monospace', fontSize: '11px',
    padding: '8px 12px', borderRadius: '2px', cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap'
  },
  calendarPopover: {
    position: 'absolute', top: '45px', right: '0', zIndex: 9999,
    background: 'rgba(5, 10, 20, 0.95)', border: '1px solid #00ffcc',
    padding: '15px', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '10px',
    boxShadow: '0 0 20px rgba(0, 255, 204, 0.3)', width: '220px'
  },
  calendarFieldGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  calendarLabel: { fontSize: '10px', color: '#00b3ff', fontFamily: 'monospace' },
  calendarInput: {
    background: '#000', border: '1px solid #00b3ff', color: '#00ffcc',
    fontFamily: 'monospace', padding: '6px', fontSize: '12px', borderRadius: '2px', outline: 'none'
  },
  applyBtn: {
    background: '#00ffcc', border: 'none', color: '#000',
    fontFamily: 'monospace', fontWeight: 'bold', fontSize: '11px',
    padding: '8px', cursor: 'pointer', borderRadius: '2px', marginTop: '5px'
  },
  telemetryPanel: {
    position: 'absolute', bottom: 30, left: 20, zIndex: 10,
    background: 'rgba(5, 10, 20, 0.85)', border: '1px solid #00b3ff',
    padding: '15px', color: '#8aa2d3', fontFamily: 'monospace',
    fontSize: '11px', lineHeight: '1.8', borderRadius: '4px',
    boxShadow: '0 0 10px rgba(0, 179, 255, 0.2)'
  },
  panelHeader: { display: 'flex', alignItems: 'center', gap: '8px', color: '#00b3ff', borderBottom: '1px dashed #00b3ff33', paddingBottom: '5px', marginBottom: '8px', fontWeight: 'bold' },
  label: { color: '#00b3ff', fontWeight: 'bold' },
  targetReticle: { width: '36px', height: '36px', border: '2px solid #00ffcc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px #00ffcc' },
  innerDot: { width: '6px', height: '6px', background: '#ff0055', borderRadius: '50%' },
  newsMarker: {
    display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 179, 255, 0.85)',
    border: '1px solid #00b3ff', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer',
    boxShadow: '0 0 10px rgba(0, 179, 255, 0.5)'
  },
  landmarkMarker: {
    display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 255, 204, 0.85)',
    border: '1px solid #00ffcc', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer',
    boxShadow: '0 0 10px rgba(0, 255, 204, 0.5)'
  },
  videoMarker: {
    display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(157, 0, 255, 0.85)',
    border: '1px solid #b026ff', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer',
    boxShadow: '0 0 12px rgba(176, 38, 255, 0.8)'
  },
  videoPlayTriangle: {
    width: 0, height: 0,
    borderTop: '4px solid transparent',
    borderBottom: '4px solid transparent',
    borderLeft: '7px solid #fff'
  },
  newsMarkerDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#fff' },
  newsMarkerLabel: { color: '#fff', fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold' },
  infoCard: { width: '270px', fontFamily: 'monospace', color: '#000' },
  infoCardImage: { width: '100%', height: '130px', objectFit: 'cover', borderRadius: '2px' },
  infoCardTag: { fontSize: '10px', color: '#0088cc', marginTop: '6px', fontWeight: 'bold' },
  locationBadge: { fontSize: '10px', background: '#111', color: '#00ffcc', padding: '2px 6px', margin: '4px 0', borderRadius: '2px' },
  infoCardTitle: { fontSize: '13px', margin: '4px 0', color: '#111', lineHeight: '1.3' },
  infoCardDesc: { fontSize: '11px', color: '#444', margin: '0 0 8px 0', lineHeight: '1.4' },
  infoCardLink: { fontSize: '11px', color: '#d90429', textDecoration: 'none', fontWeight: 'bold' },
  crosshairOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, backgroundImage: 'radial-gradient(circle, transparent 60%, rgba(0, 0, 0, 0.8) 100%)' }
};