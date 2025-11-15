import React, { useState, useEffect, useRef } from 'react';
import { CrisisType, Coords, Contact, DangerReport, SOSReport, MarkedLocation, CrisisSoundMap, QueuedMessage } from './types';
import CrisisButton from './components/CrisisButton';
import StatusSection from './components/StatusSection';
import SurvivalGuide from './components/SurvivalGuide';
import SafePointLocator from './components/SafePointLocator';
import FurtherHelp from './components/FurtherHelp';
import ContactManager from './components/ContactManager';
import DangerLog from './components/DangerLog';
import SOSCard from './components/SOSCard';
import EmergencyLocator from './components/EmergencyLocator';
import SoundManager from './components/SoundManager';
import MessageQueue from './components/MessageQueue';
import { AlertTriangleIcon } from './components/Icons';
import { getFurtherHelp, getLocationInfo } from './services/geminiService';

const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };
  return [storedValue, setValue];
};

const DEFAULT_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg';

function App() {
  const [isAlertActive, setIsAlertActive] = useState<boolean>(false);
  const [crisisType, setCrisisType] = useState<CrisisType>(CrisisType.EARTHQUAKE);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [isSharingLocation, setIsSharingLocation] = useState<boolean>(false);
  
  const [contacts, setContacts] = useLocalStorage<Contact[]>('contacts', [
    { id: '1', name: 'Mom', type: 'Family', phone: '555-0101' },
    { id: '2', name: 'John (Neighbor)', type: 'Neighbor', phone: '555-0102' },
    { id: '3', name: 'Emergency Services', type: 'Official', phone: '911' },
  ]);
  
  const [dangerReports, setDangerReports] = useLocalStorage<DangerReport[]>('dangerReports', []);
  const [sosReports, setSosReports] = useLocalStorage<SOSReport[]>('sosReports', []);
  const [markedLocations, setMarkedLocations] = useLocalStorage<MarkedLocation[]>('markedLocations', []);
  const [crisisSounds, setCrisisSounds] = useLocalStorage<CrisisSoundMap>('crisisSounds', {});
  const [messageQueue, setMessageQueue] = useLocalStorage<QueuedMessage[]>('messageQueue', []);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [locationInfo, setLocationInfo] = useState<{ locationName: string; emergencyNumber: string } | null>(null);

  useEffect(() => {
    // Fetch location-specific info once on app load for localization
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const currentCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const info = await getLocationInfo(currentCoords);
        if (info) {
          setLocationInfo(info);
          // Update the default emergency contact number
          setContacts(prevContacts => {
            const emergencyContactExists = prevContacts.some(c => c.type === 'Official');
            if (emergencyContactExists) {
              return prevContacts.map(c => 
                c.type === 'Official' ? { ...c, phone: info.emergencyNumber } : c
              );
            }
            return prevContacts;
          });
        }
      }, (err) => {
        console.warn("Could not get initial location for localization:", err.message);
      });
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Effect to process message queue when coming online
  useEffect(() => {
    if (isOnline && messageQueue.some(msg => msg.status === 'queued')) {
      setMessageQueue(prev => prev.map(msg => msg.status === 'queued' ? { ...msg, status: 'sending' } : msg));

      // Simulate sending delay and mark as 'sent'
      setTimeout(() => {
        setMessageQueue(prev => prev.map(msg => msg.status === 'sending' ? { ...msg, status: 'sent' } : msg));
      }, 2500);
    }
  }, [isOnline, messageQueue, setMessageQueue]);

  const watchIdRef = useRef<number | null>(null);

  const [furtherHelpAdvice, setFurtherHelpAdvice] = useState<string | null>(null);
  const [isFurtherHelpLoading, setIsFurtherHelpLoading] = useState<boolean>(false);
  const [furtherHelpError, setFurtherHelpError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);
  
  useEffect(() => {
    if (isAlertActive) {
      const soundUrl = crisisSounds[crisisType] || DEFAULT_SOUND_URL;
      if (soundUrl) {
          const audio = new Audio(soundUrl);
          audio.play().catch(e => console.error("Error playing sound:", e));
      }
    }
  }, [isAlertActive, crisisType, crisisSounds]);

  const queueMessages = (location: Coords | null) => {
    const locationText = location 
      ? `Last known location is Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}.`
      : "Location not available.";

    const newMessages: QueuedMessage[] = contacts.map(contact => ({
      id: `${Date.now()}-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      message: `EMERGENCY: ${crisisType} crisis declared. ${locationText} This is an automated alert.`,
      timestamp: Date.now(),
      status: 'queued',
    }));
    setMessageQueue(prev => [...prev, ...newMessages]);
  };
  
  const startLocationWatcher = () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          setLocationError(null);
        },
        () => {
          setLocationError("Unable to retrieve location. Please enable location services.");
          setUserLocation(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
  };

  const handleActivate = () => {
    setIsActivating(true);
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      queueMessages(null);
      setIsActivating(false);
      setIsAlertActive(true);
      return;
    }
    
    // Get a quick initial position for messages
    navigator.geolocation.getCurrentPosition(
      (initialPos) => {
        const initialCoords = { latitude: initialPos.coords.latitude, longitude: initialPos.coords.longitude };
        setUserLocation(initialCoords);
        queueMessages(initialCoords);
        startLocationWatcher();
        setTimeout(() => { setIsAlertActive(true); setIsActivating(false); }, 500);
      },
      () => {
        setLocationError("Unable to retrieve initial location. Sharing may be delayed.");
        queueMessages(null);
        startLocationWatcher();
        setTimeout(() => { setIsAlertActive(true); setIsActivating(false); }, 500);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  };


  const handleGetFurtherHelp = async () => {
    setIsFurtherHelpLoading(true);
    setFurtherHelpError(null);
    setFurtherHelpAdvice(null);
    try {
        const result = await getFurtherHelp(crisisType, userLocation);
        setFurtherHelpAdvice(result);
    } catch (err) {
        setFurtherHelpError('Failed to load advanced advice.');
    } finally {
        setIsFurtherHelpLoading(false);
    }
  };

  const handleReportDanger = () => {
    if (!userLocation) {
      alert("Cannot report danger: location not available.");
      return;
    }
    const newReport: DangerReport = {
      id: Date.now().toString(),
      crisisType,
      coords: userLocation,
      timestamp: Date.now(),
    };
    setDangerReports(prev => [...prev, newReport]);
    alert("Danger zone reported and saved locally.");
  };

  const handleSendSOS = () => {
    const newSOS: SOSReport = {
        id: Date.now().toString(),
        coords: userLocation,
        timestamp: Date.now(),
    };
    setSosReports(prev => [...prev, newSOS]);
    alert("SOS sent and saved locally.");
  };

  const handleMarkLocation = (note: string) => {
    if(!userLocation) {
        alert("Cannot mark location: location not available.");
        return;
    }
    const newMark: MarkedLocation = {
        id: Date.now().toString(),
        coords: userLocation,
        note,
        crisisType,
        timestamp: Date.now(),
    };
    setMarkedLocations(prev => [...prev, newMark]);
  };

  const handleSaveSound = (crisis: CrisisType, sound: string) => {
    setCrisisSounds(prev => ({ ...prev, [crisis]: sound }));
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight flex items-center justify-center">
          <AlertTriangleIcon className="w-10 h-10 mr-4 text-red-500" />
          Crisis Assistant
        </h1>
        <p className="text-gray-400 mt-2 max-w-2xl">Your personal emergency response tool. Works online and offline.</p>
      </header>

      <main className="w-full max-w-7xl flex-grow">
        {!isAlertActive ? (
          <div className="flex flex-col items-center justify-center h-full space-y-8 rounded-lg bg-black/20 p-8">
            <div className="w-full max-w-md">
              <label htmlFor="crisis-type" className="block text-lg font-medium text-gray-300 mb-2 text-center">1. Select Emergency Type</label>
              <select
                id="crisis-type"
                value={crisisType}
                onChange={(e) => setCrisisType(e.target.value as CrisisType)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                {Object.values(CrisisType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="w-full max-w-md">
                <ContactManager 
                    contacts={contacts}
                    onAdd={(c) => setContacts(prev => [...prev, { ...c, id: Date.now().toString() }])}
                    onEdit={(uc) => setContacts(prev => prev.map(c => c.id === uc.id ? uc : c))}
                    onRemove={(id) => setContacts(prev => prev.filter(c => c.id !== id))}
                />
            </div>
            <div className="w-full max-w-md">
                <SoundManager 
                    crisisType={crisisType}
                    soundMap={crisisSounds}
                    onSaveSound={handleSaveSound}
                />
            </div>
             <div className="text-center">
                <p className="text-lg font-medium text-gray-300 mb-2">4. Activate Alert</p>
                <CrisisButton onActivate={handleActivate} disabled={isActivating} />
                {isActivating && <p className="mt-4 text-amber-400 animate-pulse">Activating system...</p>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2"><StatusSection contacts={contacts} isOnline={isOnline} /></div>
            <div className="lg:col-span-2"><MessageQueue messages={messageQueue} onClear={() => setMessageQueue(prev => prev.filter(m => m.status !== 'sent'))} /></div>
            <div className="lg:col-span-2"><SurvivalGuide crisisType={crisisType} location={userLocation}/></div>
            <div className="lg:col-span-2"><SafePointLocator 
              location={userLocation} 
              locationName={locationInfo?.locationName}
              error={locationError} 
              crisisType={crisisType}
              isSharing={isSharingLocation}
              onToggleSharing={() => setIsSharingLocation(p => !p)}
              contacts={contacts}
              onReportDanger={handleReportDanger}
              onMarkLocation={handleMarkLocation}
            /></div>
            <FurtherHelp 
              onGetHelp={handleGetFurtherHelp}
              advice={furtherHelpAdvice}
              isLoading={isFurtherHelpLoading}
              error={furtherHelpError}
            />
            <SOSCard onSendSOS={handleSendSOS} reports={sosReports} isOnline={isOnline} onClear={() => setSosReports([])} />
            <DangerLog reports={dangerReports} isOnline={isOnline} onClear={() => setDangerReports([])} />
            <EmergencyLocator locations={markedLocations} onClear={() => setMarkedLocations([])} />
          </div>
        )}
      </main>
      
      <footer className="text-center text-gray-500 mt-8 text-sm">
        <p>Disclaimer: This tool is for informational purposes only. In a real emergency, please follow the guidance of official authorities.</p>
      </footer>
    </div>
  );
}

export default App;