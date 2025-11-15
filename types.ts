export enum CrisisType {
  EARTHQUAKE = "Earthquake",
  WILDFIRE = "Wildfire",
  FLOOD = "Flood",
  HURRICANE = "Hurricane",
  TORNADO = "Tornado",
  BLIZZARD = "Blizzard",
  CYCLONE = "Cyclone",
  TSUNAMI = "Tsunami",
  VOLCANIC_ERUPTION = "Volcanic Eruption",
  CHEMICAL_SPILL = "Chemical Spill",
  INFECTIOUS_DISEASE = "Infectious Disease",
}

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface Contact {
  id: string;
  name: string;
  type: string; // e.g., 'Family', 'Neighbor', 'Emergency Service'
  phone: string;
}

export interface DangerReport {
  id: string;
  crisisType: CrisisType;
  coords: Coords;
  timestamp: number;
}

export interface SOSReport {
  id: string;
  coords: Coords | null;
  timestamp: number;
}

export interface MarkedLocation {
    id: string;
    coords: Coords;
    note: string;
    crisisType: CrisisType;
    timestamp: number;
}

export type CrisisSoundMap = {
    [key in CrisisType]?: string;
};

export interface QueuedMessage {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  message: string;
  timestamp: number;
  status: 'queued' | 'sending' | 'sent';
}